import { useRef, useState } from "react";
import { Download } from "lucide-react";
import introductionVideo from "../../docs/video/formlane-introduction.mp4?url";

export function IntroductionVideo() {
  const player = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  return (
    <figure className="introduction-video">
      <video
        ref={player}
        aria-label="Introduction to Formlane"
        controls
        playsInline
        preload="metadata"
        src={introductionVideo}
        onError={() => setFailed(true)}
        onLoadedMetadata={() => setFailed(false)}
      >
        <a href={introductionVideo}>Open the introduction video</a>
      </video>
      {failed && (
        <div className="video-error" role="alert">
          <p>
            The introduction video couldn’t load. Try again or use the download
            link.
          </p>
          <button
            className="button subtle"
            type="button"
            onClick={() => {
              setFailed(false);
              player.current?.load();
            }}
          >
            Try again
          </button>
        </div>
      )}
      <figcaption>
        <span>1 min 20 sec · Silent video with on-screen captions</span>
        <a href={introductionVideo} download="formlane-introduction.mp4">
          <Download size={13} aria-hidden="true" /> Download video
        </a>
      </figcaption>
    </figure>
  );
}
