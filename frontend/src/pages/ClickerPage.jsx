import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import '../static/css/ClickerPage.css';
import gremIcon from '../static/assets/grem-icon.png';
import pregnantIcon from '../static/assets/pregnant.png';
import { useGremAnimationLogic } from '../hooks/gremAnimationLogic';

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

const MAX_NPC = 19;

const SHOP_ITEMS = [
    { id: 'gigi_sound', name: 'Gigi Sounds', price: 10, description: 'Gigi will say something occasionally!' },
    { id: 'pregnant_grem', name: 'Pregnant grem', price: 50, description: 'Get multipliers on earning nuggets!' },
    { id: 'piss_corner', name: 'Piss Corner', price: 100, description: 'Hire a grem to make nuggets!' },
    { id: 'popo', name: 'Popo', price: 100, description: 'Have Popo deliver nuggets regularly!' },
    { id: 'fruit_video', name: 'Sensory Fruit Video', price: 100, description: 'Plays sensory fruit videos in the corner!' },
    { id: 'september_video', name: 'Do You Remember', price: 100, description: 'Plays the full vod in the background. Yes.' },
];

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ClickerPage() {
    const [displayGlobalCount, setDisplayGlobalCount] = useState(0);
    const [displaySelfCount, setDisplaySelfCount] = useState(0);
    const [activePlayers, setActivePlayers] = useState(0);
    const [user, setUser] = useState({ uuid: '', username: '', clicks: 0 });
    const [leaderboard, setLeaderboard] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isBiting, setIsBiting] = useState(false);
    const [coins, setCoins] = useState(0); // Spendable coins
    const [isShopOpen, setIsShopOpen] = useState(false);

    const pendingBites = useRef(0);

    // Ref passed to every grem hook so they can read live container dimensions
    const areaRef = useRef(null);

    const userTriggerBiteRef = useRef(null);
    const handleTriggerReady = useCallback((fn) => {
        userTriggerBiteRef.current = fn;
    }, []);

    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const socketRef = useRef(null);
    const chatEndRef = useRef(null);

    const [gachaPulls, setGachaPulls] = useState(0);
    const [isGachaOpen, setIsGachaOpen] = useState(false);
    const [isRolling, setIsRolling] = useState(false);
    const [wonItem, setWonItem] = useState(null);

    // Socket.io
    useEffect(() => {
        socketRef.current = io('http://localhost:5000');
        socketRef.current.on('chat_message', (msg) => {
            setChatMessages((prev) => [...prev, msg].slice(-50));
        });
        socketRef.current.on('active_count_update', (data) => {
            setActivePlayers(data.count);
        });
        return () => socketRef.current.disconnect();
    }, []);

    // Chat
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

    // Init user
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

    // SSE stream
    useEffect(() => {
        if (!user.uuid) return;
        const eventSource = new EventSource(`http://localhost:5000/api/clicker/stream/${user.uuid}`);
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            setDisplayGlobalCount(data.total_clicks);
            setLeaderboard(data.leaderboard);
        };
        return () => eventSource.close();
    }, [user.uuid]);

    // Batch sync clicks
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
            })
                .then((res) => res.json())
                .then((data) => {
                    setUser((prev) => ({
                        ...prev,
                        clicks: data.user_total,
                        inventory: data.inventory
                    }));
                    setCoins(data.coins);
                    setGachaPulls(data.gacha_pulls_total);
                });
        }, 3000);
        return () => clearInterval(syncInterval);
    }, [user.uuid]);

    const handleBite = () => {
        if (isLoading) return;

        setIsBiting(true);
        setTimeout(() => setIsBiting(false), 100);

        pendingBites.current += 1;
        setDisplaySelfCount((prev) => prev + 1);
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
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setCoins(prev => prev - item.price);
                    // Update the local user state with the new inventory
                    setUser(prev => ({ ...prev, inventory: data.inventory }));
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

        // Simulate animation delay
        setTimeout(() => {
            fetch('http://localhost:5000/api/gacha/roll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uuid: user.uuid }),
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        setWonItem(data.reward);
                        setGachaPulls(prev => prev - 1);
                    }
                    setIsRolling(false);
                });
        }, 2000); // 2 second "spin" animation
    };

    const npcCount = Math.max(0, Math.min(activePlayers - 1, MAX_NPC));

    return (
        <div className="clicker-container">
            {isShopOpen && (
                <div className="shop-overlay" onClick={() => setIsShopOpen(false)}>
                    <div className="shop-modal" onClick={e => e.stopPropagation()}>
                        <h2>Grem Shop</h2>
                        <div className="shop-grid">
                            {SHOP_ITEMS.map(item => (
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

                {/* 1. The Alert Button in Sidebar */}
                {gachaPulls > 0 && (
                    <button className="gacha-alert-btn" onClick={() => setIsGachaOpen(true)}>
                        🎁 {gachaPulls} Pulls Available!
                    </button>
                )}

                {/* 2. The Gacha Popup */}
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

                            <button
                                disabled={isRolling || gachaPulls === 0}
                                onClick={handleGachaRoll}
                            >
                                {isRolling ? "Rolling..." : "Pull (1)"}
                            </button>
                            <button onClick={() => setIsGachaOpen(false)}>Close</button>
                        </div>
                    </div>
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