import JSZip from "jszip";

export async function downloadFilesAsZip(
  files: { name: string; url: string }[],
  zipFilename: string
) {
  const zip = new JSZip();

  // Fetch each file blob and add to ZIP
  await Promise.all(
    files.map(async (file) => {
      const res = await fetch(file.url);
      const blob = await res.blob();
      zip.file(file.name, blob);
    })
  );

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const downloadUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = zipFilename.endsWith(".zip") ? zipFilename : `${zipFilename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 15000);
}
