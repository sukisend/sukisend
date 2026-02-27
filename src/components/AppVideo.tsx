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
  const result = player.play();
  if (result && typeof (result as Promise<void>).catch === 'function') {
    (result as Promise<void>).catch(() => undefined);
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
    nextPlayer.loop = loop;
    nextPlayer.muted = muted;
  });

  useEffect(() => {
    player.loop = loop;
    player.muted = muted;
    if (!autoPlay) {
      return;
    }

    if (paused) {
      player.pause();
    } else {
      safePlay(player);
    }

    return () => {
      player.pause();
    };
  }, [autoPlay, loop, muted, paused, player]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={nativeControls}
      allowsFullscreen={allowsFullscreen ?? nativeControls}
      allowsPictureInPicture={false}
    />
  );
}
