import { useState, useEffect } from "react";

export default function ImgWithFallback({ src, alt, fallbackText, className }: {
  src: string | null | undefined;
  alt: string;
  fallbackText: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  if (!src || failed) {
    return <div className={`no-image-placeholder${className ? " " + className : ""}`}>{fallbackText}</div>;
  }
  return <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailed(true)} className={className} />;
}
