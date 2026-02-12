from flask import Blueprint, request, jsonify
from services.llm_service import LLMService
import logging

logger = logging.getLogger(__name__)
analyze_bp = Blueprint('analyze', __name__)
llm_service = LLMService()

@analyze_bp.route('/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    """Analyze content and return structured learning map"""
    
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.get_json()
        
        if not data:
            logger.warning('No JSON data provided')
            return jsonify({'error': 'No JSON data provided'}), 400
        
        content = data.get('content')
        content_type = data.get('type', 'text')
        
        if not content:
            logger.warning('No content provided')
            return jsonify({'error': 'Content is required'}), 400
        
        if not isinstance(content, str):
            logger.warning(f'Content is not a string: {type(content)}')
            return jsonify({'error': 'Content must be a string'}), 400
        
        content_stripped = content.strip()
        if len(content_stripped) < 50:
            logger.warning(f'Content too short: {len(content_stripped)} characters (need 50)')
            return jsonify({
                'error': f'Content must be at least 50 characters (received {len(content_stripped)})',
                'content_length': len(content_stripped),
                'content_preview': content_stripped[:100] if content_stripped else ''
            }), 400
        
        logger.info(f'Analyzing content of type: {content_type}, length: {len(content_stripped)}')
        
        # Call LLM service for analysis
        result = llm_service.analyze_content(content, content_type)
        
        logger.info(f'Analysis complete. Topics found: {len(result.get("keyTopics", []))}')
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f'Error in analyze endpoint: {str(e)}', exc_info=True)
        error_message = str(e)
        
        # Provide helpful error messages
        if 'Cannot connect to Ollama' in error_message:
            return jsonify({
                'error': 'Cannot connect to Ollama. Please ensure Ollama is running and accessible.',
                'details': error_message
            }), 503
        elif 'timed out' in error_message.lower():
            return jsonify({
                'error': 'Request timed out. The LLM model may be too slow or the content too large.',
                'details': error_message
            }), 504
        
        return jsonify({
            'error': 'Failed to analyze content',
            'details': error_message
        }), 500
