import { VideoContentFit, VideoSource, VideoView, useVideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

interface AppVideoProps {
  source: VideoSource;
  style: StyleProp<ViewStyle>;
  contentFit?: VideoContentFit;
  nativeControls?: boolean;
  loop?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  paused?: boolean;
  allowsFullscreen?: boolean;
}

function safePlay(player: { play: () => void | Promise<void> }) {
  try {
    const result = player.play();
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Ignore errors thrown when a native shared player has already been released.
  }
}

function safePause(player: { pause: () => void }) {
  try {
    player.pause();
  } catch {
    // Ignore errors thrown when a native shared player has already been released.
  }
}

function safeApplySettings(player: { loop: boolean; muted: boolean }, loop: boolean, muted: boolean) {
  try {
    player.loop = loop;
    player.muted = muted;
  } catch {
    // Ignore errors thrown when a native shared player has already been released.
  }
}

export function AppVideo({
  source,
  style,
  contentFit = 'contain',
  nativeControls = false,
  loop = false,
  muted = false,
  autoPlay = true,
  paused = false,
  allowsFullscreen,
}: AppVideoProps) {
  const player = useVideoPlayer(source, (nextPlayer) => {
    safeApplySettings(nextPlayer, loop, muted);
  });

  useEffect(() => {
    safeApplySettings(player, loop, muted);

    if (!autoPlay) {
      safePause(player);
      return;
    }

    if (paused) {
      safePause(player);
    } else {
      safePlay(player);
    }
  }, [autoPlay, loop, muted, paused, player]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={nativeControls}
      fullscreenOptions={{ enable: allowsFullscreen ?? nativeControls }}
      allowsPictureInPicture={false}
    />
  );
}
