import glob
import json
import os
import time

import numpy as np
import pandas as pd

from vlmeval.dataset.utils.yorn import YOrN_Extraction


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUTPUT_ROOT = os.path.join(ROOT, 'data', 'qvac-official-replication', 'outputs')
LOCAL_DATASET_PATH = os.path.join(ROOT, 'data', 'vlmeval', 'POPE_local.tsv')
DATASET_PATH = LOCAL_DATASET_PATH if os.path.exists(LOCAL_DATASET_PATH) else os.path.join(ROOT, 'data', 'vlmeval', 'POPE.tsv')
TOTAL = 5127
PUBLISHED = {
    'VisionPsy-Nano-460M': 87.9,
    'LFM2.5-VL-450M': 86.5,
    'SmolVLM2-500M': 82.7,
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
            return {int(key): value for key, value in predictions.items()}, None
        except Exception as exc:
            error = str(exc)
            time.sleep(0.2)
    return None, error


def pope_scores(predictions, answers, indices=None):
    selected = sorted(predictions) if indices is None else sorted(indices)
    truth, predicted, exact, unknown = [], [], [], 0
    for index in selected:
        if index not in predictions or index not in answers:
            continue
        extracted = YOrN_Extraction(str(predictions[index]))
        answer, category_count = answers[index]
        truth.extend([1 if answer == 'Yes' else 0] * category_count)
        predicted.extend([1 if extracted == 'Yes' else 0] * category_count)
        exact.extend([int(extracted == answer)] * category_count)
        unknown += int(extracted == 'Unknown')
    truth = np.asarray(truth, dtype=np.int8)
    predicted = np.asarray(predicted, dtype=np.int8)
    tp = int(np.sum((truth == 1) & (predicted == 1)))
    fp = int(np.sum((truth == 0) & (predicted == 1)))
    fn = int(np.sum((truth == 1) & (predicted == 0)))
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
    return {
        'count': len([index for index in selected if index in predictions and index in answers]),
        'scoredCategoryRows': len(truth),
        'f1': 100 * f1,
        'accuracy': 100 * sum(exact) / len(exact) if exact else None,
        'precision': 100 * precision,
        'recall': 100 * recall,
        'unknown': unknown,
        '_truth': truth,
        '_predicted': predicted,
    }


def bootstrap_f1(truth, predicted, rounds=1000):
    count = len(truth)
    if count < 10:
        return [None, None]
    rng = np.random.default_rng(20260822)
    values = []
    for _ in range(rounds):
        sample = rng.integers(0, count, count)
        y_true, y_pred = truth[sample], predicted[sample]
        tp = np.sum((y_true == 1) & (y_pred == 1))
        fp = np.sum((y_true == 0) & (y_pred == 1))
        fn = np.sum((y_true == 1) & (y_pred == 0))
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        values.append(2 * precision * recall / (precision + recall) if precision + recall else 0)
    return [round(100 * value, 2) for value in np.quantile(values, [0.025, 0.975])]


def public_score(score):
    return {key: value for key, value in score.items() if not key.startswith('_')}


def main():
    dataset = pd.read_csv(DATASET_PATH, sep='\t', usecols=['index', 'answer', 'category'])
    answers = {
        int(row['index']): (str(row['answer']), max(1, len(str(row['category']).split(','))))
        for _, row in dataset.iterrows()
    }
    raw_predictions = {}
    models = []
    for model in MODEL_ORDER:
        checkpoints = glob.glob(os.path.join(OUTPUT_ROOT, model, '*', '01_POPE.pkl'))
        completed = glob.glob(os.path.join(OUTPUT_ROOT, model, '*', f'{model}_POPE.xlsx'))
        candidates = checkpoints + completed
        if not candidates:
            models.append({'model': model, 'status': 'not_started', 'completed': 0, 'total': TOTAL,
                           'percentComplete': 0, 'publishedQVACReference': PUBLISHED[model]})
            continue
        checkpoint = max(candidates, key=os.path.getmtime)
        predictions, error = read_predictions_with_retry(checkpoint)
        if error:
            models.append({'model': model, 'status': 'checkpoint_temporarily_unreadable', 'error': error,
                           'completed': 0, 'total': TOTAL, 'percentComplete': 0,
                           'publishedQVACReference': PUBLISHED[model]})
            continue
        raw_predictions[model] = predictions
        score = pope_scores(predictions, answers)
        recent_indices = sorted(predictions)[-100:]
        recent = pope_scores(predictions, answers, recent_indices)
        models.append({
            'model': model,
            'status': 'complete' if score['count'] == TOTAL else 'in_progress',
            'completed': score['count'],
            'total': TOTAL,
            'percentComplete': round(100 * score['count'] / TOTAL, 2),
            **public_score({key: round(value, 2) if isinstance(value, float) else value for key, value in score.items()}),
            'last100F1': round(recent['f1'], 2) if recent['count'] else None,
            'confidence95BootstrapF1': bootstrap_f1(score['_truth'], score['_predicted']),
            'publishedQVACReference': PUBLISHED[model],
            'checkpoint': checkpoint,
        })

    available = [model for model in MODEL_ORDER if raw_predictions.get(model)]
    common = set.intersection(*(set(raw_predictions[model]) for model in available)) if available else set()
    ranking = []
    if len(available) >= 2 and common:
        for model in available:
            score = pope_scores(raw_predictions[model], answers, common)
            ranking.append({
                'model': model,
                'sampleSize': score['count'],
                'f1': round(score['f1'], 2),
                'accuracy': round(score['accuracy'], 2),
                'unknown': score['unknown'],
                'confidence95BootstrapF1': bootstrap_f1(score['_truth'], score['_predicted']),
            })
        ranking.sort(key=lambda item: (-item['f1'], MODEL_ORDER.index(item['model'])))
        for rank, item in enumerate(ranking, 1):
            item['rank'] = rank

    print(json.dumps({
        'dataset': 'POPE',
        'metric': 'official F1; Unknown is non-Yes for F1 and incorrect for accuracy, matching VLMEvalKit',
        'provisional': not all(item.get('completed') == TOTAL for item in models),
        'models': models,
        'commonComparison': {
            'availableModels': available,
            'sampleSize': len(common) if len(available) >= 2 else 0,
            'ranking': ranking,
        },
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
