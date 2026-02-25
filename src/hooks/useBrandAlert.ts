import { useMemo, useState } from 'react';

export type BrandAlertTone = 'info' | 'success' | 'error';

export interface BrandAlertConfig {
  visible: boolean;
  title: string;
  message: string;
  tone: BrandAlertTone;
  actionLabel: string;
  onAction?: (() => void) | null;
}

interface ShowAlertInput {
  title: string;
  message: string;
  tone?: BrandAlertTone;
  actionLabel?: string;
  onAction?: () => void;
}

const DEFAULT_STATE: BrandAlertConfig = {
  visible: false,
  title: '',
  message: '',
  tone: 'info',
  actionLabel: 'OK',
  onAction: null,
};

export function useBrandAlert() {
  const [state, setState] = useState<BrandAlertConfig>(DEFAULT_STATE);

  const showAlert = (input: ShowAlertInput) => {
    setState({
      visible: true,
      title: input.title,
      message: input.message,
      tone: input.tone ?? 'info',
      actionLabel: input.actionLabel ?? 'OK',
      onAction: input.onAction ?? null,
    });
  };

  const hideAlert = () => {
    setState(DEFAULT_STATE);
  };

  const confirmAlert = () => {
    const callback = state.onAction;
    hideAlert();
    callback?.();
  };

  return useMemo(
    () => ({
      alertConfig: state,
      showAlert,
      hideAlert,
      confirmAlert,
    }),
    [state],
  );
}
