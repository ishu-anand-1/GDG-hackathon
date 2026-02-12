const FLASK_API_URL = import.meta.env.VITE_FLASK_API_URL || "http://localhost:5000";

export async function uploadAudio(file: File) {
  const formData = new FormData();
  formData.append("audio", file);

  const res = await fetch(`${FLASK_API_URL}/api/audio/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: "Audio upload failed" }));
    throw new Error(errorData.error || `Audio upload failed: ${res.statusText}`);
  }

  return res.json();
}
