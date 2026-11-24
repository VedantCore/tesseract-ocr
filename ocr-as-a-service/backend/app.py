from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter, ImageOps, UnidentifiedImageError
import io
import re

app = Flask(__name__, static_folder='frontend', static_url_path='')
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024


def otsu_threshold(image):
    histogram = image.histogram()
    total = sum(histogram)
    sum_total = sum(level * count for level, count in enumerate(histogram))
    weighted_below = 0
    count_below = 0
    best_variance = -1
    best_threshold = 128

    for threshold, count in enumerate(histogram):
        count_below += count
        if count_below == 0:
            continue
        count_above = total - count_below
        if count_above == 0:
            break

        weighted_below += threshold * count
        mean_below = weighted_below / count_below
        mean_above = (sum_total - weighted_below) / count_above
        variance = count_below * count_above * (mean_below - mean_above) ** 2
        if variance > best_variance:
            best_variance = variance
            best_threshold = threshold

    return image.point(lambda pixel: 255 if pixel > best_threshold else 0)


def prepare_image(image):
    try:
        image = ImageOps.exif_transpose(image)
    except (AttributeError, OSError):
        pass

    if image.mode not in ('RGB', 'L'):
        image = image.convert('RGB')

    width, height = image.size
    scale = max(1.0, 1800.0 / max(width, height))
    if scale > 1:
        image = image.resize(
            (round(width * scale), round(height * scale)),
            Image.Resampling.LANCZOS,
        )

    grayscale = ImageOps.grayscale(image)
    grayscale = ImageOps.autocontrast(grayscale, cutoff=1)
    grayscale = grayscale.filter(ImageFilter.MedianFilter(size=3))
    grayscale = ImageEnhance.Contrast(grayscale).enhance(1.35)
    grayscale = grayscale.filter(ImageFilter.SHARPEN)

    return grayscale, otsu_threshold(grayscale)


def clean_text(text):
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = ''.join(character for character in text if character == '\n' or ord(character) >= 32)
    lines = []
    for line in text.splitlines():
        line = re.sub(r'[ \t]+', ' ', line).strip()
        if line:
            lines.append(line)
    text = '\n'.join(lines)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def extraction_score(text):
    text = clean_text(text)
    if not text:
        return -1

    words = re.findall(r'\w+', text, flags=re.UNICODE)
    alphanumeric = sum(character.isalnum() for character in text)
    unusual = sum(not (character.isalnum() or character.isspace() or character in '.,;:!?_-()[]{}\'"%&/+-') for character in text)
    return len(words) * 10 + alphanumeric - unusual * 4 - len(text.splitlines()) * 0.25


def extract_text(image):
    grayscale, binary = prepare_image(image)

    candidates = []
    for processed in (grayscale, binary):
        for psm in (6, 11):
            try:
                text = clean_text(pytesseract.image_to_string(
                    processed,
                    config=f'--oem 3 --psm {psm}',
                    timeout=15,
                ))
                data = pytesseract.image_to_data(
                    processed,
                    config=f'--oem 3 --psm {psm}',
                    output_type=pytesseract.Output.DICT,
                    timeout=15,
                )
                confidences = [
                    float(confidence)
                    for confidence in data.get('conf', [])
                    if str(confidence).strip() and float(confidence) >= 0
                ]
                confidence = sum(confidences) / len(confidences) if confidences else 0
                candidates.append((text, confidence))
            except (pytesseract.TesseractError, OSError):
                continue

    if not candidates:
        raise pytesseract.TesseractError('Tesseract OCR failed')
    return max(
        candidates,
        key=lambda candidate: extraction_score(candidate[0]) + candidate[1] * 2,
    )

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/ocr', methods=['POST'])
def ocr():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    image_file = request.files['image']
    if not image_file.filename:
        return jsonify({'error': 'No image selected'}), 400

    try:
        image = Image.open(io.BytesIO(image_file.read()))
        image.load()
    except (UnidentifiedImageError, OSError):
        return jsonify({'error': 'The uploaded file is not a valid image'}), 400

    try:
        text, confidence = extract_text(image)
    except pytesseract.TesseractError as error:
        return jsonify({'error': f'OCR processing failed: {error}'}), 500
    except (OSError, TimeoutError):
        return jsonify({'error': 'OCR processing timed out or could not read the image'}), 500

    return jsonify({
        'extracted_text': text,
        'accuracy': round(max(0, min(100, confidence)), 1),
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)