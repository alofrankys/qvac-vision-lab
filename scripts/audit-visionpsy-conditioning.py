import json
import os
import types

import pandas as pd
import torch
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MODEL = 'qvac/VisionPsy-Nano-460M'
DATA = os.path.join(ROOT, 'data', 'vlmeval', 'POPE_local.tsv')


def generate(model, processor, prompt, images):
    inputs = processor(images=images, text=prompt, return_tensors='pt')
    inputs = {key: value for key, value in inputs.items() if value is not None}
    inputs.pop('pixel_values', None)
    image_tensor = inputs.get('images')
    image_token_id = processor.tokenizer.convert_tokens_to_ids(processor.tokenizer.image_token)
    positions = (inputs['input_ids'][0] == image_token_id).nonzero().flatten().tolist()
    with torch.inference_mode():
        generated = model.generate(**inputs, max_new_tokens=2, greedy=True)
    return {
        'output': processor.batch_decode(generated, skip_special_tokens=True)[0].strip(),
        'inputTokens': int(inputs['input_ids'].shape[-1]),
        'imageTensorShape': list(image_tensor.shape) if image_tensor is not None else None,
        'imageTokenCount': len(positions),
        'firstImageToken': positions[0] if positions else None,
        'lastImageToken': positions[-1] if positions else None,
    }


def main():
    os.environ.setdefault('HF_HUB_OFFLINE', '1')
    frame = pd.read_csv(DATA, sep='\t')
    positive = frame[frame['answer'] == 'Yes'].iloc[0]
    different = frame[frame['image_path'] != positive['image_path']].iloc[0]
    correct_image = Image.open(positive['image_path']).convert('RGB')
    different_image = Image.open(different['image_path']).convert('RGB')
    white_image = Image.new('RGB', correct_image.size, 'white')
    prompt = str(positive['question']).strip() + '\nGive a very brief answer.'

    processor = AutoProcessor.from_pretrained(MODEL, trust_remote_code=True, local_files_only=True)
    model = AutoModelForImageTextToText.from_pretrained(
        MODEL, trust_remote_code=True, local_files_only=True, dtype=torch.float32,
    ).eval()
    if hasattr(model, 'apply_eager_profile'):
        model.apply_eager_profile()

    cases = {
        'correct_image': [correct_image],
        'different_image': [different_image],
        'white_image': [white_image],
        'no_image': None,
    }
    results = {}
    for name, images in cases.items():
        results[name] = generate(model, processor, prompt, images)
        print(json.dumps({'case': name, **results[name]}), flush=True)

    original_projector_forward = model.MP.forward
    def zero_projector(_projector, encoded):
        return torch.zeros(
            encoded.shape[0], encoded.shape[1] // 16, model.config.lm_hidden_dim,
            device=encoded.device, dtype=encoded.dtype,
        )
    model.MP.forward = types.MethodType(zero_projector, model.MP)
    results['correct_image_zero_visual_embeddings'] = generate(
        model, processor, prompt, [correct_image]
    )
    print(json.dumps({
        'case': 'correct_image_zero_visual_embeddings',
        **results['correct_image_zero_visual_embeddings'],
    }), flush=True)
    model.MP.forward = original_projector_forward

    original_replace = model._replace_img_tokens_with_embd
    def skip_image_replacement(_model, _input_ids, token_embd, _image_embd):
        return token_embd
    model._replace_img_tokens_with_embd = types.MethodType(skip_image_replacement, model)
    results['correct_image_keep_image_token_embeddings'] = generate(
        model, processor, prompt, [correct_image]
    )
    print(json.dumps({
        'case': 'correct_image_keep_image_token_embeddings',
        **results['correct_image_keep_image_token_embeddings'],
    }), flush=True)
    model._replace_img_tokens_with_embd = original_replace
    print(json.dumps({
        'model': MODEL,
        'device': 'cpu',
        'rowIndex': int(positive['index']),
        'gold': str(positive['answer']),
        'question': str(positive['question']),
        'correctImage': str(positive['image_path']),
        'differentImage': str(different['image_path']),
        'processorAssembly': 'image_string + prompt',
        'results': results,
    }, indent=2))


if __name__ == '__main__':
    main()
