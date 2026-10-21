import { useStore, selectWebRecovery } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { MOBILE, shareExport } from '../lib/mobile.js'
import { Row, Section } from './ui.jsx'

const RECOVERY_COPY_NAME = 'gymandme-recovery-copy.txt'

// Exports the exact opaque payload captured at boot. Recovery data must never be parsed,
// merged into S, or offered to the sync path: only a person can decide what to do with it.
export async function exportRecoveryCopy(raw, {
  mobile = MOBILE,
  share = shareExport,
  documentRef = document,
  urlRef = URL,
} = {}) {
  if (typeof raw !== 'string') return null
  if (mobile) {
    await share(raw, RECOVERY_COPY_NAME)
    return raw
  }
  const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' })
  const link = documentRef.createElement('a')
  link.href = urlRef.createObjectURL(blob)
  link.download = RECOVERY_COPY_NAME
  link.click()
  setTimeout(() => urlRef.revokeObjectURL(link.href), 60000)
  return blob
}

export default function WebRecoveryNotice() {
  const recovery = useStore(selectWebRecovery)
  if (!recovery) return null

  const download = () => exportRecoveryCopy(useStore.getState().getWebRecoveryRaw()).catch(() => {})

  return <Section title={t('Recovery')} className="web-recovery-notice">
    <Row icon="warning" iconTint="var(--orange)" title={t('Your saved Gym&Me profile needs recovery.')}
      subtitle={t('Gym&Me has not overwritten the original profile.')} />
    <Row icon="download" iconTint="var(--orange)" title={t('Download recovery copy')}
      subtitle={t('Download a recovery copy before you reset or import anything.')}
      accessory="chevron" onClick={download} />
  </Section>
}
