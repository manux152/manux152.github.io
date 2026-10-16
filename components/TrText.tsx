import { Text, TextProps } from 'react-native';
import { trChildren, useI18n } from '../lib/i18n';

/** Drop-in replacement for react-native's Text that shows plain-text children in the chosen language. */
export function TrText({ children, accessibilityLabel, ...rest }: TextProps) {
  const { t } = useI18n();
  return <Text {...rest} accessibilityLabel={typeof accessibilityLabel === 'string' ? t(accessibilityLabel) : accessibilityLabel}>{trChildren(children, t)}</Text>;
}
