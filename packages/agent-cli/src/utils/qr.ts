import qrcode from "qrcode-terminal";

export async function generateQr(text: string, small: boolean = true): Promise<void> {
  return new Promise((resolve) => {
    qrcode.generate(text, { small }, () => {
      resolve();
    });
  });
}

export function generateQrString(text: string): string {
  const lines: string[] = [];
  qrcode.generate(text, { small: true }, (qr: string) => {
    lines.push(qr);
  });
  return lines.join("\n");
}
