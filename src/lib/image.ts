/**
 * Thu nhỏ ảnh bìa trước khi lưu vào localStorage.
 * localStorage chỉ chứa được ~5MB, nên ảnh bìa được resize về tối đa
 * 600px chiều rộng và nén JPEG 0.8. Sau khi nối Supabase Storage thì
 * có thể upload ảnh gốc lên cloud thay vì nén ở đây.
 */
export async function processCoverImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Không đọc được file ảnh"));
    reader.readAsDataURL(file);
  });

  // Nếu ảnh đã nhỏ thì giữ nguyên.
  if (dataUrl.length < 300_000) return dataUrl;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Không tải được ảnh"));
    el.src = dataUrl;
  });

  const maxWidth = 600;
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}
