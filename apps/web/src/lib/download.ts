/** Saves text as a file without navigating or opening a window. */
export function downloadText(
  filename: string,
  content: string,
  type = 'text/csv;charset=utf-8',
): void {
  const safeName = filename.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'download.txt';
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
