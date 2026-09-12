import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from 'react';
import { Platform, TextInput, TextInputProps } from 'react-native';

import { buildWebInputId } from '../utils/webAccessibility';

interface AppTextInputProps extends TextInputProps {
  webId?: string;
  webName?: string;
}

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(function AppTextInput(
  { webId, webName, nativeID, accessibilityLabel, placeholder, style, ...props },
  forwardedRef,
) {
  const innerRef = useRef<TextInput | null>(null);
  const generatedId = useId();
  const resolvedId = webId ?? nativeID ?? buildWebInputId('input', generatedId, accessibilityLabel ?? placeholder ?? webName ?? 'field');
  const resolvedName = webName ?? buildWebInputId(accessibilityLabel ?? placeholder ?? 'field', generatedId);

  useImperativeHandle(forwardedRef, () => innerRef.current as TextInput);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const hostNode = innerRef.current as unknown as HTMLElement | null;
    if (!(hostNode instanceof HTMLElement)) {
      return;
    }

    const target =
      hostNode.matches('input, textarea')
        ? hostNode
        : (hostNode.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null);

    if (!target) {
      return;
    }

    if (resolvedId) {
      target.id = resolvedId;
    }

    if (resolvedName) {
      target.setAttribute('name', resolvedName);
    }

    target.style.outline = 'none';
    target.style.boxShadow = 'none';
  }, [resolvedId, resolvedName]);

  return (
    <TextInput
      ref={innerRef}
      nativeID={resolvedId}
      accessibilityLabel={accessibilityLabel ?? placeholder ?? webName}
      underlineColorAndroid="transparent"
      style={style}
      {...props}
    />
  );
});
