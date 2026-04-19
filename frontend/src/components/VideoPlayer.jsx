import { useEffect, useRef } from 'react';

export default function VideoPlayer({ src, onClose }) {
  const videoRef = useRef();

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-white text-sm opacity-60 truncate">
            {decodeURIComponent(src.split('path=')[1] || '')}
          </span>
          <button onClick={onClose} className="text-white text-2xl leading-none px-3 py-1 hover:bg-white/10 rounded">
            ✕
          </button>
        </div>
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          className="w-full rounded-lg bg-black"
          style={{ maxHeight: '75vh' }}
        >
          Your browser does not support HTML5 video.
        </video>
        <p className="text-gray-500 text-xs text-center">
          MKV files may not play in all browsers. Use VLC or download for best compatibility.
        </p>
      </div>
    </div>
  );
}
