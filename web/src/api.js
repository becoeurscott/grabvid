const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const analyzeUrl = async (url) => {
  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail?.message || 'Failed to analyze URL');
  }

  return response.json();
};

export const downloadMedia = async (url, formatId) => {
  // This usually returns a stream or a link. 
  // In the current backend, /download returns a FileResponse.
  window.open(`${API_BASE_URL}/download?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(formatId)}`, '_blank');
};
