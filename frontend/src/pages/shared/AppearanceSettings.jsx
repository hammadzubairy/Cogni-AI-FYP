import PageTop from '../../components/PageTop'
import ThemePicker from '../../components/ThemePicker'

/** Standalone appearance settings for roles without other settings panels. */
export default function AppearanceSettings({
  subtitle = 'Choose light or dark mode and a colour theme for Cogni.ai.',
}) {
  return (
    <>
      <PageTop title="Settings" subtitle={subtitle} />
      <ThemePicker />
    </>
  )
}
