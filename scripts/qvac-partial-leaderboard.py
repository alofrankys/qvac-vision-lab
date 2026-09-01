import glob
import json
import math
import os
import time

import pandas as pd

from vlmeval.dataset.utils.multiple_choice import prefetch_answer


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUTPUT_ROOT = os.path.join(ROOT, 'data', 'qvac-official-replication', 'outputs')
DATASET_PATH = os.path.join(ROOT, 'data', 'vlmeval', 'ScienceQA_TEST.tsv')
TOTAL = 2017
PUBLISHED = {
    'VisionPsy-Nano-460M': 86.5,
    'LFM2.5-VL-450M': 77.7,
    'SmolVLM2-500M': 76.3,
}
MODEL_ORDER = list(PUBLISHED)


def read_predictions_with_retry(path):
    error = None
    for _ in range(3):
        try:
            if path.endswith('.pkl'):
                predictions = pd.read_pickle(path)
            else:
                frame = pd.read_excel(path)
                predictions = dict(zip(frame['index'], frame['prediction']))
            return predictions, None
        except Exception as exc:
            error = str(exc)
            time.sleep(0.2)
    return None, error


def wilson(correct, count, z=1.96):
    if not count:
        return [None, None]
    proportion = correct / count
    denominator = 1 + z * z / count
    center = (proportion + z * z / (2 * count)) / denominator
    margin = z * math.sqrt((proportion * (1 - proportion) + z * z / (4 * count)) / count) / denominator
    return [round(100 * (center - margin), 2), round(100 * (center + margin), 2)]


def score_predictions(predictions, rows_by_index, indices=None):
    selected = sorted(predictions) if indices is None else sorted(indices)
    hits = []
    for index in selected:
        if index not in predictions or index not in rows_by_index:
            continue
        row = rows_by_index[index].copy()
        row['prediction'] = str(predictions[index])
        inferred = prefetch_answer(row)
        hits.append(int(inferred == str(row['answer'])))
    return hits


def main():
    dataset = pd.read_csv(DATASET_PATH, sep='\t')
    rows_by_index = {int(row['index']): row for _, row in dataset.iterrows()}
    raw_predictions = {}
    models = []

    for model in MODEL_ORDER:
        checkpoints = glob.glob(os.path.join(OUTPUT_ROOT, model, '*', '01_ScienceQA_TEST.pkl'))
        completed = glob.glob(os.path.join(OUTPUT_ROOT, model, '*', f'{model}_ScienceQA_TEST.xlsx'))
        candidates = checkpoints + completed
        if not candidates:
            models.append({
                'model': model,
                'status': 'not_started',
                'completed': 0,
                'total': TOTAL,
                'percentComplete': 0,
                'publishedQVAC': PUBLISHED[model],
            })
            continue
        checkpoint = max(candidates, key=os.path.getmtime)
        predictions, error = read_predictions_with_retry(checkpoint)
        if error:
            models.append({
                'model': model,
                'status': 'checkpoint_temporarily_unreadable',
                'error': error,
                'completed': 0,
                'total': TOTAL,
                'percentComplete': 0,
                'publishedQVAC': PUBLISHED[model],
            })
            continue
        predictions = {int(key): value for key, value in predictions.items()}
        raw_predictions[model] = predictions
        hits = score_predictions(predictions, rows_by_index)
        correct = sum(hits)
        completed = len(hits)
        recent = hits[-100:]
        models.append({
            'model': model,
            'status': 'complete' if completed == TOTAL else 'in_progress',
            'completed': completed,
            'total': TOTAL,
            'percentComplete': round(100 * completed / TOTAL, 2),
            'correct': correct,
            'partialAccuracy': round(100 * correct / completed, 2) if completed else None,
            'last100Accuracy': round(100 * sum(recent) / len(recent), 2) if recent else None,
            'confidence95': wilson(correct, completed),
            'publishedQVAC': PUBLISHED[model],
            'checkpoint': checkpoint,
        })

    available = [model for model in MODEL_ORDER if raw_predictions.get(model)]
    common_indices = set.intersection(*(set(raw_predictions[model]) for model in available)) if available else set()
    common_ranking = []
    if len(available) >= 2 and common_indices:
        for model in available:
            hits = score_predictions(raw_predictions[model], rows_by_index, common_indices)
            common_ranking.append({
                'model': model,
                'correct': sum(hits),
                'sampleSize': len(hits),
                'accuracy': round(100 * sum(hits) / len(hits), 2),
                'confidence95': wilson(sum(hits), len(hits)),
            })
        common_ranking.sort(key=lambda item: (-item['accuracy'], MODEL_ORDER.index(item['model'])))
        for rank, item in enumerate(common_ranking, 1):
            item['rank'] = rank

    print(json.dumps({
        'provisional': True,
        'warning': 'Partial scores change as the sample grows. Cross-model ranking uses only common completed items.',
        'models': models,
        'commonComparison': {
            'availableModels': available,
            'sampleSize': len(common_indices) if len(available) >= 2 else 0,
            'ranking': common_ranking,
        },
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
