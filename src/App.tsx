import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  ExternalLink,
  LoaderCircle,
  LogOut,
  RotateCcw,
  Sparkles,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import { getAddress } from "ethers";
import {
  appendMove,
  directions,
  isGameOver,
  newSession,
  readSession,
  rollback,
  saveSession,
  unpack,
} from "./game";
import type { Direction, Session } from "./game";
import {
  GAME_FEE,
  configured,
  connectWallet,
  errorMessage,
  getGameContract,
  networks,
  switchNetwork,
} from "./chain";
import type { NetworkName } from "./chain";

const shorten = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const arrowIcons = [ArrowUp, ArrowDown, ArrowLeft, ArrowRight];
function Brand({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={`brand-logo ${small ? "brand-logo-small" : ""}`}
      viewBox="110 310 1580 280"
      role="img"
      aria-label="BOT 2048"
      focusable="false"
    >
      <image
        href="/brand/bot2048-logo-selected.png"
        width="1774"
        height="887"
      />
    </svg>
  );
}

export default function App() {
  const [network, setNetwork] = useState<NetworkName>(
    import.meta.env.VITE_BOT_NETWORK === "testnet" ? "testnet" : "mainnet",
  );
  const [address, setAddress] = useState("");
  const loggedOut = useRef(
    (() => {
      try {
        return localStorage.getItem("bot2048:logged-out") === "true";
      } catch {
        return false;
      }
    })(),
  );
  function rememberLogout(value: boolean) {
    loggedOut.current = value;
    try {
      localStorage.setItem("bot2048:logged-out", String(value));
    } catch {
      /* Still disconnect for this page if browser storage is unavailable. */
    }
  }
  function logout() {
    rememberLogout(true);
    setAddress("");
    setWalletChain(undefined);
    setNotice("");
  }

  const [walletChain, setWalletChain] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const wallet = window.ethereum;
    if (!wallet) return;
    const accountsChanged = (value: unknown) => {
      if (loggedOut.current) return;
      const accounts = value as string[];
      setAddress(accounts[0] ? getAddress(accounts[0]) : "");
    };
    const chainChanged = (value: unknown) => setWalletChain(Number(value));
    const disconnected = () => {
      setAddress("");
      setWalletChain(undefined);
    };
    wallet
      .request({ method: "eth_accounts" })
      .then(accountsChanged)
      .catch(() => {});
    wallet
      .request({ method: "eth_chainId" })
      .then(chainChanged)
      .catch(() => {});
    wallet.on?.("accountsChanged", accountsChanged);
    wallet.on?.("chainChanged", chainChanged);
    wallet.on?.("disconnect", disconnected);
    return () => {
      wallet.removeListener?.("accountsChanged", accountsChanged);
      wallet.removeListener?.("chainChanged", chainChanged);
      wallet.removeListener?.("disconnect", disconnected);
    };
  }, []);
  useEffect(() => {
    if (!help) return;
    const previous = document.activeElement as HTMLElement | null;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelp(false);
      if (e.key === "Tab") {
        const buttons =
          document.querySelectorAll<HTMLButtonElement>(".modal button");
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      previous?.focus();
    };
  }, [help]);
  async function connect() {
    setConnecting(true);
    setNotice("");
    try {
      const account = await connectWallet(
        network,
        loggedOut.current || !!address,
      );
      rememberLogout(false);
      setAddress(account);
      setWalletChain(networks[network].id);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setConnecting(false);
    }
  }
  async function fixNetwork() {
    setConnecting(true);
    try {
      await switchNetwork(network);
      setWalletChain(networks[network].id);
      setNotice("");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setConnecting(false);
    }
  }
  const wrongNetwork = !!address && walletChain !== networks[network].id;
  return (
    <>
      <header className="site-header">
        <a className="brand-link" href="#play" aria-label="BOT 2048 首页">
          <Brand />
        </a>
        <span className="header-divider" />
        <span className="arcade-label">
          ARCADE <span>01</span>
        </span>
        <nav>
          <a className="nav-active" href="#play">
            开始游戏
          </a>
          <button onClick={() => setHelp(true)}>
            玩法指南 <ArrowUpRight size={13} />
          </button>
          <a href={networks[network].explorer} target="_blank" rel="noreferrer">
            区块浏览器 <ArrowUpRight size={13} />
          </a>
        </nav>
        <button
          className="mobile-help"
          aria-label="玩法指南"
          onClick={() => setHelp(true)}
        >
          <CircleHelp size={18} />
        </button>
        <div className="wallet-actions">
          <button
            className="wallet-button"
            onClick={wrongNetwork ? fixNetwork : connect}
            disabled={connecting}
          >
            {connecting ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Wallet size={15} />
            )}
            <span>
              {connecting
                ? "连接中…"
                : wrongNetwork
                  ? "切换网络"
                  : address
                    ? shorten(address)
                    : "连接钱包"}
            </span>
          </button>
          {address && (
            <button
              className="logout-button"
              onClick={logout}
              disabled={connecting}
            >
              <LogOut size={14} />
              退出登录
            </button>
          )}
        </div>
      </header>
      <main id="play">
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="status-dot" /> THE NEXT MOVE IS YOURS
            </div>
            <h1>
              小小方块，<span>无限可能。</span>
            </h1>
            <p>滑动，合并，突破 2048。在 BOT Chain 开启你的方块挑战。</p>
          </div>
          <div className="edition">
            <span>THE ONCHAIN CLASSIC</span>
            <strong>
              2048<span> / BOT EDITION</span>
            </strong>
          </div>
        </section>
        {notice && (
          <div className="notice" role="alert">
            <span>{notice}</span>
            <button aria-label="关闭提示" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <Game
          key={`${network}:${address}`}
          network={network}
          setNetwork={setNetwork}
          address={address}
          ready={!!address && !wrongNetwork}
          connect={wrongNetwork ? fixNetwork : connect}
          connecting={connecting}
          helpOpen={help}
          openHelp={() => setHelp(true)}
        />
      </main>
      <footer>
        <Brand small />
        <span>一个经典游戏，一种链上新体验。</span>
      </footer>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              autoFocus
              aria-label="关闭玩法指南"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">HOW TO PLAY</div>
            <h2 id="help-title">从 2 开始，向 2048 前进。</h2>
            <ol>
              <li>
                <strong>滑动方块</strong>
                <p>使用方向键、WASD、下方方向按钮，或在手机棋盘上滑动。</p>
              </li>
              <li>
                <strong>相同数字，合二为一</strong>
                <p>2 + 2 = 4，每次合并增加分数。达到 2048 后可以继续挑战。</p>
              </li>
              <li>
                <strong>链上游戏</strong>
                <p>
                  点击“开一局”，在钱包中确认合约交易。确认成功后即可移动方块，后续移动在本地完成，无需再次确认钱包。
                </p>
              </li>
              <li>
                <strong>随时回来继续</strong>
                <p>
                  同一浏览器会保存每局进度。交易等待期间请勿重复提交；刷新后可点击“检查交易”恢复。
                </p>
              </li>
            </ol>
            <button className="primary full" onClick={() => setHelp(false)}>
              准备好了，开始游戏 <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </>
  );
}

interface GameProps {
  network: NetworkName;
  setNetwork: (n: NetworkName) => void;
  address: string;
  ready: boolean;
  connect: () => Promise<void>;
  connecting: boolean;
  helpOpen: boolean;
  openHelp: () => void;
}
function Game({
  network,
  setNetwork,
  address,
  ready,
  connect,
  connecting,
  helpOpen,
  openHelp,
}: GameProps) {
  const onchain = true;
  const net = networks[network];
  const hasContract = configured(network);
  const key = `bot2048:v1:${network}:${net.address.toLowerCase()}:${address.toLowerCase()}`;
  const [session, setSession] = useState<Session>(() =>
    readSession(key, address || undefined),
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [restart, setRestart] = useState(false);
  const [continued, setContinued] = useState(false);
  const [copied, setCopied] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const board = unpack(BigInt(session.boards.at(-1)!));
  const score = session.scores.at(-1)!;
  const highest = Math.max(...board);
  const over = isGameOver(board);
  const won = highest >= 11 && !continued;
  const frozen =
    busy || !!session.pending || restart || helpOpen || !session.started;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!saveSession(key, session))
      setError("浏览器无法保存进度，请勿关闭此页面。");
  }, [key, session]);
  function persist(next: Session) {
    saveSession(key, next);
    if (mounted.current) setSession(next);
  }
  async function submit(candidate: Session) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setStatus("正在读取链上进度…");
    try {
      const { contract, provider } = await getGameContract(network, address);
      if (candidate.pending) {
        const receipt = await provider.getTransactionReceipt(
          candidate.pending.hash,
        );
        if (!receipt) {
          setStatus("交易仍在确认中，请稍后检查。");
          return;
        }
        if (receipt.status !== 1) {
          const recovered =
            candidate.moves.length > 0
              ? rollback(candidate)
              : { ...candidate, pending: undefined };
          persist(recovered);
          throw new Error("交易未成功，已恢复可重试的棋盘。");
        }
      }
      const state = await contract.state(candidate.id);
      const confirmed =
        Number(state.nextMove) === 0 ? 0 : Number(state.nextMove) - 1;
      if (
        Number(state.nextMove) > 0 &&
        confirmed <= candidate.moves.length &&
        BigInt(candidate.boards[confirmed]) === state.board
      ) {
        const hashes = candidate.pending
          ? [...new Set([...candidate.transactions, candidate.pending.hash])]
          : candidate.transactions;
        persist({
          ...candidate,
          confirmed,
          started: true,
          pending: undefined,
          transactions: hashes,
        });
        setStatus("开局已确认，可以继续游戏。");
        return;
      }
      if (candidate.pending)
        throw new Error(
          "交易已确认，但棋盘状态不匹配。请保留游戏记录并检查合约配置。",
        );
      if (
        candidate.started ||
        candidate.moves.length !== 0 ||
        Number(state.nextMove) !== 0
      )
        throw new Error("游戏记录不一致，请保留当前记录并重新开局。");
      setStatus("请在钱包中确认开局交易…");
      const tx = await contract.openGame(
        candidate.id,
        BigInt(candidate.boards[0]),
        {
          value: GAME_FEE,
        },
      );
      const pending = {
        ...candidate,
        pending: { hash: tx.hash as string, count: candidate.moves.length },
      };
      persist(pending);
      setStatus("交易已发送，等待 BOT Chain 确认…");
      const receipt = await provider.waitForTransaction(tx.hash, 1, 90_000);
      if (!receipt) throw new Error("交易仍在确认中，请稍后点击“检查交易”。");
      if (receipt.status !== 1) {
        persist(
          candidate.moves.length > 0
            ? rollback(candidate)
            : { ...candidate, pending: undefined },
        );
        throw new Error("交易未成功，棋盘已恢复，可以重试。");
      }
      persist({
        ...candidate,
        confirmed: candidate.moves.length,
        started: true,
        transactions: [...candidate.transactions, tx.hash],
        pending: undefined,
      });
      setStatus("开局已确认，开始挑战吧。");
    } catch (e) {
      if (mounted.current) {
        setError(errorMessage(e));
        setStatus("");
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function handleMove(direction: Direction) {
    if (frozen || lock.current || over || won) return;
    const next = appendMove(session, direction);
    if (!next) return;
    setError("");
    persist(next);
    setStatus("");
  }
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      )
        return;
      const keys: Record<string, Direction> = {
        ArrowUp: 0,
        ArrowDown: 1,
        ArrowLeft: 2,
        ArrowRight: 3,
        w: 0,
        s: 1,
        a: 2,
        d: 3,
      };
      const direction = keys[event.key];
      if (direction !== undefined) {
        event.preventDefault();
        handleMove(direction);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
  function reset() {
    if (busy || session.pending) return;
    if (!ready) {
      void connect();
      return;
    }
    if (!hasContract) return;
    setRestart(false);
    setError("");
    setStatus("");
    setContinued(false);
    void submit(newSession(address));
  }
  async function copyId() {
    try {
      await navigator.clipboard.writeText(session.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("复制失败，请从游戏记录中选择并复制 ID。");
    }
  }
  const progress = Math.min(100, (highest / 11) * 100);
  return (
    <div className="game-layout">
      <aside className="left-panel">
        <div className="game-title">
          <div className="eyebrow">MERGE. BUILD. REPEAT.</div>
          <h2 className="game-logo-title">
            <Brand />
          </h2>
          <div className="game-subtitle">
            经典不变，<span>链上新生。</span>
          </div>
        </div>
        <p className="mode-description">
          连接钱包开启一局，畅快合并，挑战高分。
        </p>
        <div className="score-grid">
          <div className="score-card">
            <span>当前得分</span>
            <strong data-testid="score">{score.toLocaleString()}</strong>
            <span className="score-foot">YOUR SCORE</span>
          </div>
          <div className="score-card">
            <span>
              <Trophy size={13} />
              最高方块
            </span>
            <strong>{2 ** highest}</strong>
            <span className="score-foot">TOP TILE</span>
          </div>
        </div>
        <button
          className="primary new-game"
          disabled={busy || !!session.pending}
          onClick={reset}
        >
          <RotateCcw size={16} />
          开一局
          <ArrowUpRight size={16} />
        </button>
        <button className="how-button" onClick={openHelp}>
          <CircleHelp size={14} />
          第一次玩？了解游戏规则
        </button>
        <div className="little-note">
          <span className="asterisk">✳</span>
          <p>
            一步一步，
            <br />
            让可能性翻倍。
          </p>
          <span className="note-line" />
        </div>
      </aside>
      <section className="board-section" aria-label="2048 游戏区域">
        <div className="board-heading">
          <span>
            <span className="status-dot" />
            ONCHAIN MODE
          </span>
          <span>4 × 4 GRID</span>
        </div>
        <div className="board-wrap">
          <div
            className="board"
            role="group"
            aria-label="2048 棋盘"
            tabIndex={0}
            onTouchStart={(e) => {
              touch.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
              };
            }}
            onTouchEnd={(e) => {
              if (!touch.current) return;
              const dx = e.changedTouches[0].clientX - touch.current.x,
                dy = e.changedTouches[0].clientY - touch.current.y;
              touch.current = null;
              if (Math.max(Math.abs(dx), Math.abs(dy)) > 24)
                handleMove(
                  Math.abs(dx) > Math.abs(dy)
                    ? dx > 0
                      ? 3
                      : 2
                    : dy > 0
                      ? 1
                      : 0,
                );
            }}
          >
            {board.map((tile, index) => (
              <div
                key={`${index}:${tile}`}
                className={`tile tile-${Math.min(tile, 11)} ${tile ? "tile-filled" : ""}`}
                aria-label={`第 ${Math.floor(index / 4) + 1} 行第 ${(index % 4) + 1} 列：${tile ? 2 ** tile : "空"}`}
              >
                <span>{tile ? 2 ** tile : ""}</span>
                {tile >= 9 && <span className="tile-star">✦</span>}
              </div>
            ))}
          </div>
          {(over || won || restart) && (
            <div className="board-overlay">
              <div className="overlay-icon">
                {restart ? <RotateCcw /> : <Trophy />}
              </div>
              <h3>
                {restart
                  ? "新的可能，即将开始"
                  : won
                    ? "2048，做到了！"
                    : "这一局，很精彩。"}
              </h3>
              <p>
                {restart
                  ? "确定结束当前游戏并重新开始吗？"
                  : `本局得分 ${score.toLocaleString()} · 最高方块 ${2 ** highest}`}
              </p>
              {restart ? (
                <>
                  <button className="primary" onClick={reset}>
                    确定重新开始
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setRestart(false)}
                  >
                    继续当前游戏
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="primary"
                    onClick={won ? () => setContinued(true) : reset}
                  >
                    {won ? "继续挑战" : "再来一局"}
                    <ArrowRight size={16} />
                  </button>
                  {won && (
                    <button className="text-button" onClick={reset}>
                      开始新一局
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div className="board-footer">
          <span>
            <span className="key-hint">↑ ↓ ← →</span> 方向键 / WASD
          </span>
          <span>
            或在屏幕上滑动 <span>↔</span>
          </span>
        </div>
        <div className="mobile-controls" aria-label="方向控制">
          {([2, 0, 1, 3] as Direction[]).map((direction) => {
            const Icon = arrowIcons[direction];
            return (
              <button
                key={direction}
                aria-label={`向${directions[direction]}移动`}
                disabled={frozen || over || won}
                onClick={() => handleMove(direction)}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </div>
        <div className="game-feedback" aria-live="polite">
          {busy ? (
            <>
              <LoaderCircle size={14} className="spin" />
              {status}
            </>
          ) : error ? (
            <span className="error-text">{error}</span>
          ) : (
            status ||
            (!hasContract
              ? "游戏合约尚未部署，部署完成后即可开始链上游戏。"
              : !ready
                ? "连接钱包并切换到 BOT Chain，即可开始。"
                : !session.started
                  ? "点击“开一局”，在钱包确认后开始游戏。"
                  : "尽情合并方块，游戏进度会自动保存在本机。")
          )}
        </div>
        {session.pending && (
          <button
            className="primary full"
            disabled={busy || !ready || !hasContract}
            onClick={() => void submit(session)}
          >
            检查交易
            {busy ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <ArrowRight size={14} />
            )}
          </button>
        )}
      </section>
      <aside className="right-panel">
        <section className="network-card">
          <div className="card-label">
            POWERED BY <span className="mini-logo">B</span>
          </div>
          <div className="network-title">
            BOT Chain <ArrowUpRight size={18} />
          </div>
          <p>每一个方块，连接更多可能。</p>
          <label className="network-select">
            <span className="status-dot" />
            <select
              aria-label="选择 BOT 网络"
              value={network}
              disabled={busy}
              onChange={(e) => setNetwork(e.target.value as NetworkName)}
            >
              <option value="mainnet">BOT Mainnet</option>
              <option value="testnet">BOT Testnet</option>
            </select>
            <ChevronDown size={14} />
          </label>
          <div className="network-details">
            <span>网络代币</span>
            <strong>BOT</strong>
            <span>游戏状态</span>
            <strong className={hasContract ? "mint-text" : ""}>
              {hasContract ? "已配置" : "待部署"}
            </strong>
          </div>
          {onchain && !ready && (
            <button
              className="outline-button full"
              onClick={connect}
              disabled={connecting}
            >
              <Wallet size={14} />
              {address ? "切换钱包网络" : "连接钱包开始"}
            </button>
          )}
          {onchain && !hasContract && (
            <p className="deployment-note">合约部署完成后开放链上模式。</p>
          )}
        </section>
        <section className="progress-card">
          <div className="card-label">
            下一个里程碑 <Sparkles size={15} />
          </div>
          <div className="milestone">
            <strong>{2 ** highest}</strong>
            <span>/ 2048</span>
            <span className="milestone-glyph">✧</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-label">
            <span>{highest >= 11 ? "已达成目标" : "从小开始，向大进发"}</span>
            <span>第 {Math.min(highest, 11)} / 11 阶</span>
          </div>
        </section>
        <section className="session-card">
          <div className="card-label">
            本局记录 <span className="session-indicator" />
          </div>
          <div className="session-stat">
            <span>已移动</span>
            <strong data-testid="moves">
              {session.moves.length}
              <small> 步</small>
            </strong>
          </div>
          <div className="session-stat">
            <span>开局状态</span>
            <strong>
              {session.pending
                ? "确认中"
                : session.started
                  ? "已确认"
                  : "未开始"}
            </strong>
          </div>
          {onchain && (
            <>
              <div className="session-id">
                <span title={session.id}>{shorten(session.id)}</span>
                <button aria-label="复制游戏 ID" onClick={copyId}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
              {(session.pending?.hash || session.transactions.at(-1)) && (
                <a
                  className="transaction-link"
                  href={`${net.explorer}/tx/${session.pending?.hash || session.transactions.at(-1)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {session.pending ? "查看待确认交易" : "查看开局交易"}
                  <ExternalLink size={12} />
                </a>
              )}
            </>
          )}
          <div className="session-note">
            <span className="status-dot" />
            {session.pending
              ? "等待确认"
              : session.started
                ? "进度保存在本机"
                : "准备上链"}
          </div>
        </section>
      </aside>
    </div>
  );
}
