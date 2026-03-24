import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import '../static/css/ClickerPage.css';
import gremIcon from '../static/assets/grem-icon.png';
import pregnantIcon from '../static/assets/pregnant.png';
import { useGremAnimationLogic } from '../hooks/gremAnimationLogic';
import { SHOP_ITEMS } from '../hooks/shopItems';

function NpcGrem({ areaRef }) {
    const { x, y, rotation, isIdle } = useGremAnimationLogic(areaRef, false);

    return (
        <img
            src={gremIcon}
            className={`grem ${isIdle ? 'wandering' : ''}`}
            style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                transition: 'none',
                zIndex: 3,
            }}
            alt="grem"
        />
    );
}

function UserGrem({ onTriggerReady, areaRef }) {
    const { x, y, rotation, isIdle, triggerBite } = useGremAnimationLogic(areaRef, true);

    useEffect(() => {
        onTriggerReady(triggerBite);
    }, [triggerBite, onTriggerReady]);

    return (
        <img
            src={gremIcon}
            className={`grem is-user ${isIdle ? 'wandering' : ''}`}
            style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                transition: 'none',
                zIndex: 10,
            }}
            alt="your grem"
        />
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ClickerPage() {

    const MAX_NPC = 19;

    // ── Global state (from SSE)
    const [displayGlobalCount, setDisplayGlobalCount] = useState(0);
    const [activePlayers, setActivePlayers] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);

    // ── Personal state (also from SSE after each batch write)
    const [displaySelfCount, setDisplaySelfCount] = useState(0);
    const [coins, setCoins] = useState(0);
    const [gachaPulls, setGachaPulls] = useState(0);

    // ── Static user identity (set once on init, never overwritten by SSE)
    const [user, setUser] = useState({ uuid: '', username: '', clicks: 0 });
    const [isLoading, setIsLoading] = useState(true);

    // ── Optimistic local counters (updated instantly on click, synced via SSE)
    const pendingBites = useRef(0);
    const optimisticCoins = useRef(0);   // tracks coins added since last SSE update

    const [isBiting, setIsBiting] = useState(false);
    const [isShopOpen, setIsShopOpen] = useState(false);
    const [isGachaOpen, setIsGachaOpen] = useState(false);
    const [isRolling, setIsRolling] = useState(false);
    const [wonItem, setWonItem] = useState(null);

    const areaRef = useRef(null);
    const userTriggerBiteRef = useRef(null);
    const handleTriggerReady = useCallback((fn) => {
        userTriggerBiteRef.current = fn;
    }, []);

    // ── Chat
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const socketRef = useRef(null);
    const chatEndRef = useRef(null);

    // ── SSE ref so we can close/reopen on reconnect
    const esRef = useRef(null);


    // ── Socket.IO — chat only
    useEffect(() => {
        socketRef.current = io('http://localhost:5000');
        socketRef.current.on('chat_message', (msg) => {
            setChatMessages((prev) => [...prev, msg].slice(-50));
        });
        return () => socketRef.current.disconnect();
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        socketRef.current.emit('send_message', {
            username: user.username || 'Anonymous Grem',
            text: chatInput,
            timestamp: new Date().toLocaleTimeString(),
        });
        setChatInput('');
    };


    // ── Init user (runs once)
    useEffect(() => {
        let deviceId = localStorage.getItem('user_uuid') || crypto.randomUUID();
        localStorage.setItem('user_uuid', deviceId);

        fetch('http://localhost:5000/api/user/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid: deviceId }),
        })
            .then((res) => res.json())
            .then((userData) => {
                setUser(userData);
                setDisplaySelfCount(userData.clicks);
                setCoins(userData.coins);
                setGachaPulls(userData.gacha_pulls);
                setIsLoading(false);
            });
    }, []);


    // ── SSE stream — single source of truth for all live data
    useEffect(() => {
        if (!user.uuid) return;

        function connect() {
            const es = new EventSource(`http://localhost:5000/api/clicker/stream/${user.uuid}`);
            esRef.current = es;

            es.onmessage = (event) => {
                const data = JSON.parse(event.data);

                setDisplayGlobalCount(data.total_clicks);
                setLeaderboard(data.leaderboard);
                setActivePlayers(data.active_players);

                // Personal fields — only present when the server refreshes them
                // (i.e. right after this user's batch write lands)
                if (data.user_clicks !== undefined) {
                    setDisplaySelfCount(data.user_clicks);
                    optimisticCoins.current = 0; // reset optimistic offset
                    setCoins(data.user_coins);
                    setGachaPulls(data.user_gacha_pulls);
                    setUser((prev) => ({
                        ...prev,
                        clicks: data.user_clicks,
                        inventory: data.user_inventory,
                    }));
                }
            };

            es.onerror = () => {
                es.close();
                // Reconnect after 3 s — handles network blips, tab wake-ups, proxy drops
                setTimeout(connect, 3000);
            };
        }

        connect();
        return () => esRef.current?.close();
    }, [user.uuid]);


    // ── Batch-write clicks to the server every 3s
    useEffect(() => {
        if (!user.uuid) return;
        const syncInterval = setInterval(() => {
            if (pendingBites.current === 0) return;
            const amountToSend = pendingBites.current;
            pendingBites.current = 0;

            fetch('http://localhost:5000/api/clicker/increment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: amountToSend, uuid: user.uuid }),
            });
        }, 3000);
        return () => clearInterval(syncInterval);
    }, [user.uuid]);


    // ── Click handler — optimistic UI only, actual state arrives via SSE
    const handleBite = () => {
        if (isLoading) return;

        setIsBiting(true);
        setTimeout(() => setIsBiting(false), 100);

        pendingBites.current += 1;
        optimisticCoins.current += 1;

        setDisplaySelfCount((prev) => prev + 1);
        setDisplayGlobalCount((prev) => prev + 1)
        setCoins((prev) => prev + 1);
        userTriggerBiteRef.current?.();
    };


    const handleChangeName = (e) => {
        e.stopPropagation();
        const newName = prompt('Choose a unique username:');
        if (newName && newName.length <= 15) {
            fetch('http://localhost:5000/api/user/update-username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uuid: user.uuid, username: newName }),
            })
                .then((res) => res.json())
                .then((data) => {
                    if (data.success) setUser((prev) => ({ ...prev, username: data.username }));
                    else alert(data.error);
                });
        }
    };


    const handleBuy = (item) => {
        if (coins < item.price) return alert("Not enough coins!");

        fetch('http://localhost:5000/api/shop/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid: user.uuid, id: item.id, price: item.price }),
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    // Apply locally so the UI responds instantly
                    setCoins((prev) => prev - item.price);
                    setUser((prev) => ({ ...prev, inventory: data.inventory }));
                    alert(`Purchased ${item.name}!`);
                } else {
                    alert(data.error);
                }
            });
    };


    const handleGachaRoll = () => {
        if (gachaPulls <= 0 || isRolling) return;

        setIsRolling(true);
        setWonItem(null);

        setTimeout(() => {
            fetch('http://localhost:5000/api/gacha/roll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uuid: user.uuid }),
            })
                .then((res) => res.json())
                .then((data) => {
                    if (data.success) {
                        setWonItem(data.reward);
                        setGachaPulls((prev) => prev - 1);
                    }
                    setIsRolling(false);
                });
        }, 2000);
    };


    const npcCount = Math.max(0, Math.min(activePlayers - 1, MAX_NPC));

    return (
        <div className="clicker-container">

            {isShopOpen && (
                <div className="shop-overlay" onClick={() => setIsShopOpen(false)}>
                    <div className="shop-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Grem Shop</h2>
                        <div className="shop-grid">
                            {SHOP_ITEMS.map((item) => (
                                <div key={item.id} className="shop-item">
                                    <h4>{item.name}</h4>
                                    <p>{item.description}</p>
                                    <button onClick={() => handleBuy(item)}>
                                        Buy for {item.price} 🍪
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button className="close-shop" onClick={() => setIsShopOpen(false)}>Close</button>
                    </div>
                </div>
            )}

            {isGachaOpen && (
                <div className="shop-overlay">
                    <div className="gacha-modal">
                        <h2>Grem Capsule</h2>
                        <div className={`capsule-machine ${isRolling ? 'shaking' : ''}`}>
                            {wonItem ? (
                                <div className="win-display">
                                    <h3>You got: {wonItem.name}!</h3>
                                    <p>{wonItem.rarity}</p>
                                </div>
                            ) : (
                                <div className="idle-display">Ready to Roll?</div>
                            )}
                        </div>
                        <button disabled={isRolling || gachaPulls === 0} onClick={handleGachaRoll}>
                            {isRolling ? "Rolling..." : "Pull (1)"}
                        </button>
                        <button onClick={() => setIsGachaOpen(false)}>Close</button>
                    </div>
                </div>
            )}

            <aside className="user-sidebar">
                <div className="user-settings">
                    <h3>Your Profile</h3>
                    <div className="username-display">{user.username}</div>
                    <button className="edit-btn" onClick={handleChangeName}>Change Name</button>
                </div>
                <div className="personal-stats">
                    <p>Lifetime Crumbs: <strong>{displaySelfCount.toLocaleString()}</strong></p>
                    <p>Nuggets: <strong style={{ color: 'gold' }}>{coins.toLocaleString()} 🪙</strong></p>
                    <p>Online players: <strong>{activePlayers}</strong></p>
                </div>

                <button className="edit-btn shop-btn" onClick={() => setIsShopOpen(true)}>Open Shop</button>

                {gachaPulls > 0 && (
                    <button className="gacha-alert-btn" onClick={() => setIsGachaOpen(true)}>
                        🎁 {gachaPulls} Pulls Available!
                    </button>
                )}

                <div className="chat-container">
                    <div className="chat-messages">
                        {chatMessages.map((msg, i) => (
                            <div key={i} className="chat-entry">
                                <span className="chat-user">{msg.username}:</span>
                                <span className="chat-text">{msg.text}</span>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>
                    <form className="chat-input-wrap" onSubmit={handleSendMessage}>
                        <input
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Type to chat..."
                        />
                    </form>
                </div>
            </aside>

            <main className="main-game-center" onClick={handleBite}>
                <div className="counter-display">
                    Crumbs Eaten: {displayGlobalCount.toLocaleString()}
                </div>

                <div className="game-area" ref={areaRef}>
                    <UserGrem onTriggerReady={handleTriggerReady} areaRef={areaRef} />

                    {Array.from({ length: npcCount }, (_, i) => (
                        <NpcGrem key={i} areaRef={areaRef} />
                    ))}

                    <img
                        src={pregnantIcon}
                        className={`food-item ${isBiting ? 'is-bitten' : ''}`}
                        alt="food"
                    />
                </div>
            </main>

            <aside className="leaderboard-panel">
                <h3>Fattest Grems</h3>
                <ul className="leader-list">
                    {leaderboard.map((player, i) => (
                        <li key={i} className="leader-item">
                            <span className="leader-name">{player.username}</span>
                            <span className="leader-score">{(player.clicks || 0).toLocaleString()}</span>
                        </li>
                    ))}
                </ul>
            </aside>
        </div>
    );
}