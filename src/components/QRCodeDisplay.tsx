import { QRCodeCanvas } from 'qrcode.react';

interface QRCodeDisplayProps {
  url: string;
  size?: number;
}

export function QRCodeDisplay({ url, size = 256 }: QRCodeDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-4 bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
      <div className="p-4 bg-white rounded-lg">
        <QRCodeCanvas 
          value={url} 
          size={size}
          level="H"
          includeMargin={true}
        />
      </div>
      <p className="text-sm font-medium text-gray-500 text-center max-w-[200px]">
        Escanea para unirte a la sesión
      </p>
    </div>
  );
}
