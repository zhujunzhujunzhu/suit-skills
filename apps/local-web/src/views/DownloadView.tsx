import { useMemo, useState } from 'react';
import {
  compareSemver,
  detectPlatform,
  downloadAndOpenDesktopInstaller,
  GITEE_REPO_URL,
  getDesktopDownloadHref,
  PLATFORM_LABELS,
  type DesktopPlatform,
  type DesktopRelease,
} from '../api/download';

function IconDownload() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2v13" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 18h16" />
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

export default function DownloadView({
  currentVersion,
  isDesktop,
  latestDesktopRelease,
  latestWebVersion,
  onBack,
  webVersion,
}: {
  currentVersion: string | null;
  isDesktop: boolean;
  latestDesktopRelease: DesktopRelease | null | 'loading';
  latestWebVersion: string | null | 'loading';
  onBack: () => void;
  webVersion: string;
}) {
  const detectedPlatform = useMemo(() => detectPlatform(), []);
  const [installingPlatform, setInstallingPlatform] = useState<DesktopPlatform | null>(null);
  const [downloadError, setDownloadError] = useState('');
  const release = latestDesktopRelease;
  const currentRuntimeVersion = isDesktop ? currentVersion : webVersion;
  const currentRuntimeLabel = isDesktop ? '桌面端' : 'Web 端';
  const latestRuntimeVersion = isDesktop
    ? release !== 'loading' && release ? release.version : null
    : latestWebVersion !== 'loading'
      ? latestWebVersion
      : null;
  const runtimeUpdateAvailable =
    currentRuntimeVersion && latestRuntimeVersion
      ? compareSemver(latestRuntimeVersion, currentRuntimeVersion) > 0
      : false;

  const platformOrder: DesktopPlatform[] = [
    'windows-x86_64',
    'darwin-aarch64',
    'darwin-x86_64',
  ];

  async function installDesktopAsset(platform: DesktopPlatform) {
    setDownloadError('');
    setInstallingPlatform(platform);
    try {
      await downloadAndOpenDesktopInstaller(platform);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : '下载安装包失败，请稍后重试。',
      );
    } finally {
      setInstallingPlatform(null);
    }
  }

  return (
    <section className="download-page">
      <div className="download-topbar">
        <button type="button" className="button" onClick={onBack}>
          <IconArrowLeft />
          返回
        </button>
      </div>
      <div className="download-hero">
        <span className="download-hero-icon">
          <IconDownload />
        </span>
        <div>
          <h1>{isDesktop ? '检查更新' : '下载桌面版'}</h1>
          <p>
            {isDesktop
              ? `当前桌面版本 v${currentVersion ?? '-'}，以下是 Gitee 上的最新构建。`
              : `当前 Web 版本 v${webVersion}${
                  latestWebVersion && latestWebVersion !== 'loading'
                    ? runtimeUpdateAvailable
                      ? `，npm 最新版本为 v${latestWebVersion}。`
                      : '，当前已是 npm 最新版本。'
                    : '。'
                } 下载 Suit Skills 桌面应用，获得更流畅的本地体验。`}
          </p>
        </div>
      </div>

      {release === 'loading' ? (
        <div className="state">正在获取最新版本信息…</div>
      ) : release === null ? (
        <div className="download-error">
          <p>无法获取版本信息，请稍后重试或直接前往 Gitee 仓库查看。</p>
          <a
            href={GITEE_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="button"
          >
            前往 Gitee 仓库
          </a>
        </div>
      ) : (
        <>
          <div className="download-version-badge download-version-badge--current">
            当前{currentRuntimeLabel}
            <strong>v{currentRuntimeVersion ?? '-'}</strong>
            <span
              className={
                runtimeUpdateAvailable
                  ? 'download-status-tag download-status-tag--update'
                  : 'download-status-tag'
              }
            >
              {runtimeUpdateAvailable ? '可更新' : '已最新'}
            </span>
          </div>
          <div className="download-version-badge">
            最新版本<strong>v{release.version}</strong>
            <span className="download-date">
              {new Date(release.pub_date).toLocaleDateString('zh-CN')}
            </span>
          </div>

          <div className="download-platforms">
            {platformOrder.map((key) => {
              const asset = release.platforms[key];
              const meta = PLATFORM_LABELS[key];
              const isCurrent = key === detectedPlatform;
              const installing = installingPlatform === key;
              return (
                <div
                  key={key}
                  className={`download-card ${isCurrent ? 'recommended' : ''}`}
                >
                  {isCurrent ? <span className="download-card-badge">推荐</span> : null}
                  <div className="download-card-info">
                    <strong>{meta.os}</strong>
                    <span>{meta.arch}</span>
                    <code>{asset?.filename ?? meta.ext}</code>
                  </div>
                  {asset && isDesktop ? (
                    <button
                      type="button"
                      className="button primary"
                      disabled={installingPlatform !== null}
                      onClick={() => void installDesktopAsset(key)}
                    >
                      <IconDownload />
                      {installing ? '准备中...' : '下载并安装'}
                    </button>
                  ) : asset ? (
                    <a
                      href={getDesktopDownloadHref(key, asset, isDesktop)}
                      className="button primary"
                      download={asset.filename}
                    >
                      <IconDownload />
                      下载
                    </a>
                  ) : (
                    <span className="download-card-na">暂未提供</span>
                  )}
                </div>
              );
            })}
          </div>

          {downloadError ? (
            <div className="download-error download-error--compact">
              <p>{downloadError}</p>
            </div>
          ) : null}

          {release.notes ? (
            <div className="download-notes">
              <strong>构建说明</strong>
              <span>{release.notes}</span>
            </div>
          ) : null}

          <div className="download-footer">
            <a
              href={`${GITEE_REPO_URL}/tree/desktop-artifacts`}
              target="_blank"
              rel="noreferrer"
              className="button"
            >
              查看 Gitee 仓库
            </a>
            <p className="download-hint">
              下载后直接运行安装包即可完成升级，无需卸载旧版本。
            </p>
          </div>
        </>
      )}
    </section>
  );
}
