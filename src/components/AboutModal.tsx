import { useEffect, useState } from 'react'
import { Modal, Stack, Text, Divider, Group } from '@mantine/core'
import packageJson from '../../package.json'
import wechatQr from '../assets/qrcode-wechat.jpg'
import logoImg from '../assets/logo.png'
import bilibiliSvg from '../assets/brand-bilibili.svg'
import douyinSvg from '../assets/brand-tiktok.svg'
import xiaohongshuSvg from '../assets/brand-xiaohongshu.svg'
import youtubeSvg from '../assets/brand-youtube.svg'

const ABOUT_QCLAW_LITE_URL = 'https://my.feishu.cn/wiki/N4PGwaSTOiSuavknd5ncRsyqnth'
const APP_VERSION = packageJson.version

export function resolveAboutModalVersion(
  status: {
    currentVersion?: string | null
  } | null | undefined
): string {
  return String(status?.currentVersion || '').trim()
}

const SOCIAL_LINKS = [
  { label: '官网', icon: logoImg, url: 'https://qclawai.com' },
  { label: 'Bilibili', icon: bilibiliSvg, url: 'https://space.bilibili.com/385670211' },
  { label: '抖音', icon: douyinSvg, url: 'https://www.douyin.com/user/MS4wLjABAAAAwbbVuf1W2DdgRe0xCa0oxg1ZIHbzuiTzyjq3NcOVgBuu6qIidYlMYqbL3ZFY2swu?from_tab_name=main' },
  { label: '小红书', icon: xiaohongshuSvg, url: 'https://www.xiaohongshu.com/user/profile/63b622ab00000000260066bd?xsec_token=ABvEULb4Lxn_B-E2qKLygX0nhjP_jX00fcAyAjQmSqLE0%3D&xsec_source=pc_search' },
  { label: 'YouTube', icon: youtubeSvg, url: 'https://www.youtube.com/@qiuzhi2046' },
]

function SocialCard({ label, icon, url }: { label: string; icon: string; url: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={() => window.open(url)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${hovered ? 'var(--app-hover-border)' : 'var(--app-border)'}`,
        backgroundColor: hovered ? 'var(--app-bg-tertiary)' : 'transparent',
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
        minWidth: 52,
      }}
    >
      <img src={icon} alt={label} style={{ width: 20, height: 20, objectFit: 'contain' }} />
      <Text size="xs" c="var(--app-text-muted)" style={{ fontSize: 10, lineHeight: 1 }}>{label}</Text>
    </div>
  )
}

export default function AboutModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [appVersion, setAppVersion] = useState(APP_VERSION)

  useEffect(() => {
    if (!opened) return

    let cancelled = false
    void window.api.getQClawUpdateStatus()
      .then((status) => {
        const nextVersion = resolveAboutModalVersion(status)
        if (!cancelled && nextVersion) {
          setAppVersion(nextVersion)
        }
      })
      .catch(() => null)

    return () => {
      cancelled = true
    }
  }, [opened])

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={(
        <a
          href={ABOUT_QCLAW_LITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
          className="hover:underline"
        >
          关于 Qclaw
        </a>
      )}
      centered
      size="sm"
    >
      <Stack gap="md" py="xs">

        {/* 标语 */}
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          backgroundColor: 'var(--app-bg-tertiary)',
          border: '1px solid var(--app-border)',
        }}>
          <Text size="xs" c="var(--app-text-secondary)" ta="center" style={{ lineHeight: 1.7 }}>
            遇到问题或有新需求，欢迎随时反馈给我们 🙌
            <br />
            关注公众号，获取最新动态与使用技巧
          </Text>
        </div>

        {/* 二维码 */}
        <Group justify="center" gap="xl">
          <Stack align="center" gap={6}>
            <img
              src={wechatQr}
              alt="微信公众号"
              style={{ width: 88, height: 88, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--app-border)' }}
            />
            <Text size="xs" c="var(--app-text-muted)">微信公众号</Text>
          </Stack>
        </Group>

        <Divider />

        <Stack gap={4} align="center">
          <Text size="sm" c="var(--app-text-muted)">版本 {appVersion || '—'}</Text>
          <Text size="sm" c="var(--app-text-muted)">Based on OpenClaw</Text>
          <Text size="xs" c="var(--app-text-muted)" ta="center">
            基于 Apache License 2.0 协议分发。详情请参见 LICENSE。
          </Text>
        </Stack>

        {/* 社交链接 */}
        <Group justify="center" gap="sm">
          {SOCIAL_LINKS.map((link) => (
            <SocialCard key={link.label} {...link} />
          ))}
        </Group>

      </Stack>
    </Modal>
  )
}
