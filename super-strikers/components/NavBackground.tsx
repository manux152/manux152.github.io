import { View } from 'react-native';
import { Image } from 'expo-image';
import { NavLook, webBackground } from '../lib/navTheme';
import { useNavLook } from '../lib/useNavLook';

/** Fills its parent with the navigation background (colour, gradient, stripes or picture). Used behind every header. */
export function NavBackground({ look: given }: { look?: NavLook }) {
  const mine = useNavLook(); const look = given ?? mine;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: look.bg }, webBackground(look) as any]}>
      {look.image ? (<>
        <Image source={{ uri: look.image }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} contentFit="cover" accessibilityLabel="" />
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${look.overlay})` }} />
      </>) : null}
    </View>
  );
}
