import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mangastack.app',
  appName: '漫栈',
  webDir: 'dist',
  android: {
    backgroundColor: '#0b0b0c',
    allowMixedContent: false,
  },
}

export default config
