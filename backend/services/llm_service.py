import requests
import json
import os
import re
from typing import Dict, Any


class LLMService:
    def __init__(self):
        self.api_url = os.getenv('OLLAMA_API_URL', 'http://localhost:11434')
        self.model = os.getenv('OLLAMA_MODEL', 'phi')
        self.timeout = 300

    def analyze_content(self, content: str, content_type: str = "text") -> Dict[str, Any]:
        """
        Reliable content analyzer:
        - LLM generates summary
        - Python extracts topics
        - Topic tree always created
        """

        content = content[:1200]

        summary = self._generate_summary(content)
        topics = self._extract_topics(content)
        topic_tree = self._build_topic_tree(topics)

        return {
            "summary": summary,
            "keyTopics": topics,
            "topicTree": topic_tree
        }

    # -----------------------------
    # LLM SUMMARY
    # -----------------------------
    def _generate_summary(self, content: str) -> str:
        prompt = f"Summarize this text in 2 sentences:\n\n{content}"

        try:
            response = requests.post(
                f"{self.api_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False
                },
                timeout=self.timeout
            )

            if response.status_code == 200:
                return response.json()["response"].strip()

        except Exception:
            pass

        return content[:200]

    # -----------------------------
    # IMPROVED TOPIC EXTRACTION
    # -----------------------------
    def _extract_topics(self, content: str):
        topics = []

        # Detect "Topic: description" patterns
        colon_pattern = r"([A-Za-z0-9\s]+):"
        matches = re.findall(colon_pattern, content)

        for match in matches:
            topic = match.strip()

            # Filter out non-topic lines
            if 3 < len(topic) < 40:
                topics.append(topic)

        # Detect "Law" patterns explicitly
        law_pattern = r"(Law of Inertia|Second Law|Third Law)"
        law_matches = re.findall(law_pattern, content, re.IGNORECASE)

        for lm in law_matches:
            topic = lm.strip()
            if topic not in topics:
                topics.append(topic)

        # Remove duplicates
        topics = list(dict.fromkeys(topics))

        # Fallback extraction
        if not topics:
            words = re.findall(r"[A-Z][a-z]+(?:\s[A-Z][a-z]+)*", content)
            topics = list(set(words))[:6]

        if not topics:
            topics = ["Main Concept"]

        return topics[:6]

    # -----------------------------
    # TOPIC TREE BUILDER
    # -----------------------------
    def _build_topic_tree(self, topics):
        children = []

        for i, topic in enumerate(topics):
            children.append({
                "id": f"1-{i+1}",
                "label": topic
            })

        return [
            {
                "id": "1",
                "label": "Learning Topics",
                "children": children
            }
        ]
