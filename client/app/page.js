'use client';
import { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Plane, Box, Text, Float, Sky, Environment, Cylinder, Sphere, useGLTF, useAnimations } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { SkeletonUtils } from 'three-stdlib';
import io from 'socket.io-client';
import * as THREE from 'three';

let socket;

// ==========================================
// ⚠️ GAME & CAMPUS CONFIG
// ==========================================
const AVATAR_SCALE = 1; 
const ICE_SERVERS = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// 🚀 Symmetrical Campus Blueprint
const CAMPUS_BUILDINGS = [
  { name: "ADMIN BLOCK", pos: [0, 0, -50], dim: [30, 20, 20], color: "#cbd5e1" },
  { name: "CENTRAL LIBRARY", pos: [0, 0, 50], dim: [25, 15, 20], color: "#94a3b8" },
  { name: "CS BLOCK", pos: [-50, 0, -20], dim: [20, 18, 20], color: "#e2e8f0" },
  { name: "MECH BLOCK", pos: [50, 0, -20], dim: [20, 18, 20], color: "#e2e8f0" },
  { name: "BOYS HOSTEL", pos: [-50, 0, 20], dim: [20, 25, 25], color: "#f8fafc" },
  { name: "GIRLS HOSTEL", pos: [50, 0, 20], dim: [20, 25, 25], color: "#f8fafc" },
];

const getBuildingPosition = (index) => {
  const startX = 80; 
  const startZ = -40 + (index * 20);
  return [startX, 0, startZ];
};

// ==========================================
// 🧠 UTILITIES & TOOLS
// ==========================================
const generateSummary = (text) => {
  if (!text || text.length < 50) return "Text too short to summarize.";
  const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];
  if (sentences.length <= 2) return text;
  const first = sentences[0].trim();
  const longest = sentences.slice(1).reduce((a, b) => a.length > b.length ? a : b).trim();
  return `✨ TL;DR: ${first} ${longest}`;
};

const compressImage = (file, callback) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new window.Image(); 
    img.src = event.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const scaleSize = MAX_WIDTH / img.width;
      canvas.width = MAX_WIDTH;
      canvas.height = img.height * scaleSize;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.6)); 
    };
  };
};

function AudioPlayer({ stream }) {
  const audioRef = useRef();
  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);
  return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
}

// ==========================================
// 🧍 PLAYER AVATAR & ANIMATIONS
// ==========================================
function HumanModel({ currentAction }) {
  const groupRef = useRef();
  const { scene, animations } = useGLTF('/avatar.glb');
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, groupRef);

  useEffect(() => {
    clonedScene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const idleName = animations.find(a => a.name.toLowerCase().includes('idle'))?.name || 'idle';
    const walkName = animations.find(a => a.name.toLowerCase().includes('walk'))?.name || 'walk';
    const runName = animations.find(a => a.name.toLowerCase().includes('run'))?.name || 'run';

    let targetAnim = idleName;
    if (currentAction === 'walk') targetAnim = walkName;
    if (currentAction === 'run') targetAnim = runName;

    const action = actions[targetAnim];
    if (action) {
      action.reset().fadeIn(0.2).play();
      return () => action.fadeOut(0.2);
    }
  }, [currentAction, actions, animations, clonedScene]);

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} scale={AVATAR_SCALE} position={[0, 0, 0]} />
    </group>
  );
}
useGLTF.preload('/avatar.glb');

// ==========================================
// 🏢 HIGH-FIDELITY ENVIRONMENT PROPS
// ==========================================
function CentralFountain() {
  return (
    <group position={[0, 0, 0]}>
      <Cylinder args={[8, 8, 0.5, 32]} position={[0, 0.25, 0]} receiveShadow castShadow>
        <meshStandardMaterial color="#94a3b8" />
      </Cylinder>
      <Cylinder args={[7, 7, 0.2, 32]} position={[0, 0.6, 0]}>
        <meshStandardMaterial color="#38bdf8" transparent opacity={0.8} />
      </Cylinder>
      <Cylinder args={[1.5, 1.5, 3, 16]} position={[0, 1.5, 0]} castShadow>
        <meshStandardMaterial color="#cbd5e1" />
      </Cylinder>
      <Sphere args={[2, 16, 16]} position={[0, 3.5, 0]} castShadow>
        <meshStandardMaterial color="#0ea5e9" roughness={0.1} metalness={0.9} />
      </Sphere>
    </group>
  );
}

function DetailedBuilding({ name, pos, dim, color }) {
  const [w, h, d] = dim;
  const rowsY = Math.max(1, Math.floor(h / 3.5));
  const glassBands = [];

  for (let r = 1; r < rowsY; r++) {
    const offsetY = r * (h / rowsY) + 1;
    glassBands.push(offsetY);
  }

  return (
    <group position={pos}>
      <Box args={[w, h, d]} position={[0, h / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.9} metalness={0.1} />
      </Box>
      <Box args={[w + 0.5, 0.5, d + 0.5]} position={[0, h + 0.25, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </Box>
      
      {glassBands.map((y, idx) => (
        <Box key={`band-${idx}`} args={[w + 0.1, 1.5, d + 0.1]} position={[0, y, 0]}>
          <meshStandardMaterial color="#38bdf8" roughness={0.1} metalness={0.8} />
        </Box>
      ))}

      <Box args={[4, 3, 0.2]} position={[0, 1.5, d / 2 + 0.05]}>
        <meshStandardMaterial color="#0f172a" />
      </Box>
      <Text position={[0, 4.5, d / 2 + 0.1]} fontSize={1.5} color="#1e293b" fontWeight="bold">
        {name}
      </Text>

      {name === "MECH BLOCK" && (
        <group position={[0, 1, d/2 + 0.5]} scale={0.5}>
          <Box args={[2, 2, 2]} position={[-3, 0, 0]}><meshStandardMaterial color="#eee"/></Box>
          <Box args={[2, 2, 2]} position={[3, 0, 0]}><meshStandardMaterial color="#eee"/></Box>
        </group>
      )}
    </group>
  );
}

function PlayerBuilding({ id, index, position, ownerName }) {
  const hubColor = index % 2 === 0 ? "#0ea5e9" : "#6366f1";
  return (
    <group position={position}>
      <Box args={[10, 8, 10]} position={[0, 4, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={hubColor} roughness={0.2} transparent opacity={0.9} /> 
      </Box>
      <Box args={[11, 0.5, 11]} position={[0, 8.25, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </Box>
      <Cylinder args={[0.5, 0.5, 100, 16]} position={[0, 50, 0]}>
        <meshStandardMaterial color={hubColor} emissive={hubColor} emissiveIntensity={1} transparent opacity={0.4} side={THREE.DoubleSide} />
      </Cylinder>
      <Float speed={2} rotationIntensity={0} floatIntensity={0.5}>
        <Text position={[0, 10, 0]} fontSize={1} color="white" outlineWidth={0.05} outlineColor="#000">
          {ownerName}'s Hub
        </Text>
      </Float>
      <Box args={[3, 4, 0.1]} position={[0, 2, 5.05]}>
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1} />
      </Box>
      <Text position={[0, 2.5, 5.15]} fontSize={0.5} color="black" fontWeight="bold">ENTER</Text>
    </group>
  );
}

function CanteenArea({ position }) {
  return (
    <group position={position}>
      <Box args={[2, 1, 3]} position={[-3, 0.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#8b5a2b" roughness={0.9} />
      </Box>
      <Box args={[2, 1, 3]} position={[3, 0.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#8b5a2b" roughness={0.9} />
      </Box>
      <Box args={[8, 2, 2]} position={[0, 1, 5]} castShadow receiveShadow>
        <meshStandardMaterial color="#eee" />
      </Box>
      <Text position={[0, 2.5, 6]} fontSize={0.8} color="#ef4444">THE QUAD CAFE</Text>
    </group>
  );
}

function Tree({ position }) {
  return (
    <group position={position}>
      <Cylinder args={[0.3, 0.4, 3, 8]} position={[0, 1.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#4a3018" roughness={0.9} />
      </Cylinder>
      <Sphere args={[1.5, 16, 16]} position={[0, 3.5, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1e4d2b" roughness={0.8} />
      </Sphere>
    </group>
  );
}

function StreetLight({ position }) {
  return (
    <group position={position}>
      <Cylinder args={[0.1, 0.15, 8, 8]} position={[0, 4, 0]} castShadow>
        <meshStandardMaterial color="#111" roughness={0.2} />
      </Cylinder>
      <mesh position={[0, 8.2, 0]}>
        <sphereGeometry args={[0.4]} />
        <meshStandardMaterial color="#ffeba1" emissive="#ffeba1" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

function ParkingStall({ position }) {
  return (
    <group position={position}>
      <Box args={[0.1, 0.06, 5]} position={[-1.5, 0.06, 0]} receiveShadow><meshStandardMaterial color="white"/></Box>
      <Box args={[0.1, 0.06, 5]} position={[1.5, 0.06, 0]} receiveShadow><meshStandardMaterial color="white"/></Box>
    </group>
  );
}

function CampusProps() {
  return (
    <group>
      <Cylinder args={[0.02, 0.02, 1, 8]} position={[-45, 0.5, 20]} rotation={[0,0,Math.PI/2]}><meshStandardMaterial color="#222"/></Cylinder>
      <Cylinder args={[0.02, 0.02, 1, 8]} position={[-44, 0.5, 20]} rotation={[0,0,Math.PI/2]}><meshStandardMaterial color="#222"/></Cylinder>
      <Cylinder args={[0.4, 0.4, 1.2, 16]} position={[CAMPUS_BUILDINGS[0].pos[0], 0.6, CAMPUS_BUILDINGS[0].pos[2] + 11]} castShadow receiveShadow>
        <meshStandardMaterial color="#ef4444" />
      </Cylinder>
    </group>
  );
}

// ==========================================
// 🚶 PLAYER PHYSICS & COLLISION ENGINE
// ==========================================
function Avatar({ id, position, serverAction, color, isMain, onMove, chatMsg, playersList, onNearHub, hasJoined }) {
  const groupRef = useRef();
  const keys = useRef({ ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false, shift: false });
  const lastEmitTime = useRef(0);
  
  const initialized = useRef(false);
  
  const { camera, controls } = useThree();
  const [localAction, setLocalAction] = useState('idle');

  const displayName = playersList[id]?.username || id.substring(0,4);

  useEffect(() => {
    if (groupRef.current && position && !isMain) {
      groupRef.current.position.set(position.x, 0, position.z);
      if (position.rotationY !== undefined) groupRef.current.rotation.y = position.rotationY;
    }
  }, [position, isMain]);

  useEffect(() => {
    if (!isMain || !hasJoined) return;
    const handleKeyDown = (e) => {
      if (keys.current.hasOwnProperty(e.key)) keys.current[e.key] = true;
      if (e.key === 'Shift') keys.current.shift = true;
      
      // 🚀 GOD MODE: Press 'T' to instantly teleport to the road
      if (e.key === 't' || e.key === 'T') {
        if (groupRef.current && camera && controls) {
          groupRef.current.position.set(0, 0, 25);
          camera.position.set(0, 5, 35);
          controls.target.set(0, 1.5, 25);
          controls.update();
        }
      }
    };
    const handleKeyUp = (e) => {
      if (keys.current.hasOwnProperty(e.key)) keys.current[e.key] = false;
      if (e.key === 'Shift') keys.current.shift = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isMain, hasJoined, camera, controls]);

  useFrame((state) => {
    if (!isMain || !groupRef.current || !controls || !hasJoined) return;

    if (!initialized.current) {
      groupRef.current.position.set(0, 0, 25);
      camera.position.set(0, 5, 35);
      controls.target.set(0, 1.5, 25);
      controls.update();
      initialized.current = true;
      onMove({ x: 0, y: 0, z: 25, action: 'idle', rotationY: 0 });
    }

    let nearestHub = null;
    const currentPos = groupRef.current.position;
    Object.keys(playersList).forEach((hubId, index) => {
      const [bx, by, bz] = getBuildingPosition(index);
      const doorPos = new THREE.Vector3(bx, 2, bz + 5.05); 
      if (currentPos.distanceTo(doorPos) < 4) nearestHub = hubId;
    });
    onNearHub(nearestHub);

    const isRunning = keys.current.shift;
    const speed = isRunning ? 0.3 : 0.1; 
    
    const moveVec = new THREE.Vector3(0, 0, 0);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; 
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    if (keys.current.ArrowUp) moveVec.add(forward);
    if (keys.current.ArrowDown) moveVec.sub(forward);
    if (keys.current.ArrowLeft) moveVec.sub(right);
    if (keys.current.ArrowRight) moveVec.add(right);

    const currentlyMoving = moveVec.lengthSq() > 0;
    let nextAction = 'idle';
    if (currentlyMoving) nextAction = isRunning ? 'run' : 'walk';

    if (localAction !== nextAction) {
      setLocalAction(nextAction);
      onMove({ x: groupRef.current.position.x, y: 0, z: groupRef.current.position.z, action: nextAction, rotationY: groupRef.current.rotation.y });
    }

    if (currentlyMoving) {
      moveVec.normalize().multiplyScalar(speed);
      const newX = groupRef.current.position.x + moveVec.x;
      const newZ = groupRef.current.position.z + moveVec.z;

      const isWall = (tx, tz) => {
        if (Math.abs(tx) > 145 || Math.abs(tz) > 145) return true; 
        
        let hit = false;
        
        CAMPUS_BUILDINGS.forEach(b => {
          const [bx, by, bz] = b.pos;
          const [bw, bh, bd] = b.dim;
          if (tx > bx - bw/2 - 1 && tx < bx + bw/2 + 1 && tz > bz - bd/2 - 1 && tz < bz + bd/2 + 1) hit = true;
        });

        Object.keys(playersList).forEach((hubId, index) => {
          const [bx, by, bz] = getBuildingPosition(index);
          if (tx > bx - 5.5 && tx < bx + 5.5 && tz > bz - 5.5 && tz < bz + 5.5) hit = true;
        });

        // 🚀 GHOST FIX
        const currentDist = Math.sqrt(currentPos.x * currentPos.x + currentPos.z * currentPos.z);
        const newDist = Math.sqrt(tx*tx + tz*tz);
        
        if (newDist < 8 && currentDist >= 8) hit = true; 
        
        return hit;
      };

      if (!isWall(newX, newZ)) {
        groupRef.current.position.set(newX, 0, newZ);
        groupRef.current.rotation.y = Math.atan2(moveVec.x, moveVec.z); 
        camera.position.x += moveVec.x;
        camera.position.z += moveVec.z;
        controls.target.set(newX, 1.5, newZ); 
        controls.update();

        if (state.clock.elapsedTime - lastEmitTime.current > 0.05) {
          onMove({ x: newX, y: 0, z: newZ, action: nextAction, rotationY: groupRef.current.rotation.y });
          lastEmitTime.current = state.clock.elapsedTime;
        }
      }
    }
  });

  const displayAction = isMain ? localAction : (serverAction || 'idle');

  return (
    // 🚀 FRAME 1 SPAWN FIX INJECTED HERE
    <group ref={groupRef} position={[position?.x || 0, 0, position?.z || 25]}>
      <Float speed={2} rotationIntensity={0} floatIntensity={0.2}>
        <Text position={[0, 2.2, 0]} rotation={[0, -groupRef.current?.rotation.y || 0, 0]} fontSize={0.3} color="white" outlineWidth={0.03} outlineColor="black" fontWeight="bold">
          {isMain ? `${displayName} (You)` : displayName}
        </Text>
      </Float>
      {chatMsg && (
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          <Text position={[0, 3.2, 0]} rotation={[0, -groupRef.current?.rotation.y || 0, 0]} fontSize={0.4} color="white" anchorX="center" anchorY="middle">
            {chatMsg}
            <meshBasicMaterial color="black" transparent opacity={0.8} />
          </Text>
        </Float>
      )}
      <Suspense fallback={<mesh position={[0, 1, 0]}><boxGeometry args={[1, 2, 1]} /><meshStandardMaterial color={color} opacity={0.8} transparent /></mesh>}>
        <HumanModel currentAction={displayAction} />
      </Suspense>
    </group>
  );
}

// ==========================================
// 🌐 MAIN UI APP & SOCKET LOGIC
// ==========================================
export default function Home() {
  const [myId, setMyId] = useState(null);
  const [players, setPlayers] = useState({});
  const [chatInput, setChatInput] = useState("");
  const [myMsg, setMyMsg] = useState("");
  const [nearbyHub, setNearbyHub] = useState(null);
  const [isHubOpen, setIsHubOpen] = useState(false);
  const [serverAddress, setServerAddress] = useState("localhost");
  
  const [allHubData, setAllHubData] = useState({});
  const [hubTab, setHubTab] = useState('notes'); 
  const [isDictatingChat, setIsDictatingChat] = useState(false);
  const [isDictatingNotes, setIsDictatingNotes] = useState(false);

  const [hasJoined, setHasJoined] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [chatLedger, setChatLedger] = useState([]);
  const chatEndRef = useRef(null);

  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [voiceEnabled, setVoiceEnabled] = useState(false); 

  useEffect(() => {
    // 🚀 FORCED LOCALHOST SOCKET CONNECTION INJECTED HERE
    const cloudServerUrl = "http://localhost:3001";
    setServerAddress("Local Server");

    socket = io(cloudServerUrl, { transports: ['websocket'], upgrade: false });
    
    socket.on('connect', () => setMyId(socket.id));
    socket.on('currentPlayers', (ps) => setPlayers(ps));
    
    socket.on('newPlayer', async (d) => {
      setPlayers(p => ({ ...p, [d.id]: d.player || d }));
      if (localStreamRef.current) {
        const peerConnection = createPeerConnection(d.id);
        peersRef.current[d.id] = peerConnection;
        localStreamRef.current.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStreamRef.current);
        });
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('webrtc-offer', { to: d.id, offer });
      }
    });
    
    socket.on('playerMoved', (d) => {
      setPlayers(p => ({ 
        ...p, [d.id]: { ...p[d.id], x: d.x, z: d.z, action: d.action, rotationY: d.rotationY } 
      }));
    });
    
    socket.on('chatMessage', (d) => {
      setPlayers(p => ({ ...p, [d.id]: { ...p[d.id], msg: d.msg || d.text } }));
      if (d.msg !== "" && d.text !== "") {
        setChatLedger(prev => [...prev, { id: Date.now(), sender: d.sender || d.username || d.id.substring(0,4), text: d.msg || d.text }]);
      }
    });
    
    socket.on('hubDataState', (state) => setAllHubData(state));
    socket.on('hubDataUpdated', (data) => {
      setAllHubData(prevData => ({ ...prevData, [data.hubId]: data.hubData }));
    });

    socket.on('playerDisconnected', (disconnectedId) => {
      setPlayers((currentPlayers) => {
        const newPlayers = { ...currentPlayers };
        delete newPlayers[disconnectedId];
        return newPlayers;
      });
      if (peersRef.current[disconnectedId]) {
        peersRef.current[disconnectedId].close();
        delete peersRef.current[disconnectedId];
      }
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        delete newStreams[disconnectedId];
        return newStreams;
      });
    });

    socket.on('webrtc-offer', async (data) => {
      if (!localStreamRef.current) return; 
      const peerConnection = createPeerConnection(data.from);
      peersRef.current[data.from] = peerConnection;
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('webrtc-answer', { to: data.from, answer });
    });

    socket.on('webrtc-answer', async (data) => {
      const peerConnection = peersRef.current[data.from];
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    socket.on('webrtc-ice-candidate', async (data) => {
      const peerConnection = peersRef.current[data.from];
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    return () => socket.disconnect();
  }, []);

  const createPeerConnection = (peerId) => {
    const peerConnection = new RTCPeerConnection(ICE_SERVERS);
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', { to: peerId, candidate: event.candidate });
      }
    };
    peerConnection.ontrack = (event) => {
      setRemoteStreams(prev => ({ ...prev, [peerId]: event.streams[0] }));
    };
    return peerConnection;
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLedger]);

  const handleNotesChange = (e) => {
    updateLocalAndRemoteHub(nearbyHub, e.target.value, undefined);
  };

  const handleSummarize = () => {
    if (!nearbyHub || !allHubData[nearbyHub]?.notes) return;
    const currentNotes = allHubData[nearbyHub].notes;
    const summary = generateSummary(currentNotes);
    updateLocalAndRemoteHub(nearbyHub, `${summary}\n\n---\n\n${currentNotes}`, undefined);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file, (base64Image) => {
      const currentImages = allHubData[nearbyHub]?.images || [];
      updateLocalAndRemoteHub(nearbyHub, undefined, [...currentImages, base64Image]);
    });
  };

  const updateLocalAndRemoteHub = (hubId, newNotes, newImages) => {
    setAllHubData(prevData => {
      const currentHub = prevData[hubId] || { notes: "", images: [] };
      const updatedHub = {
        notes: newNotes !== undefined ? newNotes : currentHub.notes,
        images: newImages !== undefined ? newImages : currentHub.images
      };
      if (socket) {
        socket.emit('updateHubData', { hubId, notes: updatedHub.notes, images: updatedHub.images });
      }
      return { ...prevData, [hubId]: updatedHub };
    });
  };

  const startDictation = (target) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech-to-Text. Try Google Chrome.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.onstart = () => {
      if (target === 'chat') setIsDictatingChat(true);
      else setIsDictatingNotes(true);
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (target === 'chat') {
        setChatInput(prev => prev + " " + transcript);
      } else {
        const currentNotes = allHubData[nearbyHub]?.notes || "";
        updateLocalAndRemoteHub(nearbyHub, currentNotes + " " + transcript + "\n", undefined);
      }
    };
    recognition.onend = () => {
      setIsDictatingChat(false);
      setIsDictatingNotes(false);
    };
    recognition.start();
  };

  useEffect(() => {
    if (!hasJoined) return;
    const handleInteract = (e) => {
      if (e.key.toLowerCase() === 'e' && nearbyHub && !isHubOpen) setIsHubOpen(true);
      if (e.key === 'Escape') setIsHubOpen(false);
    };
    window.addEventListener('keydown', handleInteract);
    return () => window.removeEventListener('keydown', handleInteract);
  }, [nearbyHub, isHubOpen, hasJoined]);

  const sendChat = (e) => {
    if (e.key === 'Enter' && chatInput.trim() && hasJoined) {
      socket?.emit('chatMessage', { text: chatInput, username: usernameInput }); 
      setMyMsg(chatInput);
      setChatLedger(prev => [...prev, { id: Date.now(), sender: "You", text: chatInput }]);
      setChatInput("");
      setTimeout(() => setMyMsg(""), 5000); 
    }
  };

  const handleJoinGame = async () => {
    if (usernameInput.trim().length > 0) {
      socket?.emit('setUsername', usernameInput.trim());
      socket?.emit('playerMovement', { x: 0, y: 0, z: 25, action: 'idle', rotationY: 0, username: usernameInput.trim() });
      setHasJoined(true); 
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setVoiceEnabled(true);
        } catch (err) {
          console.warn("User denied microphone access.");
        }
      }
    }
  };

  const environmentProps = useMemo(() => {
    const props = [];
    for(let z = -100; z <= 100; z += 25) {
      if(Math.abs(z) < 15) continue; 
      props.push({ type: 'tree', pos: [-12, 0, z] });
      props.push({ type: 'tree', pos: [12, 0, z] });
      props.push({ type: 'light', pos: [-12, 0, z + 12] });
      props.push({ type: 'light', pos: [12, 0, z + 12] });
    }
    for(let x = -100; x <= 100; x += 25) {
      if(Math.abs(x) < 15) continue; 
      props.push({ type: 'tree', pos: [x, 0, -12] });
      props.push({ type: 'tree', pos: [x, 0, 12] });
      props.push({ type: 'light', pos: [x + 12, 0, -12] });
      props.push({ type: 'light', pos: [x + 12, 0, 12] });
    }
    return props;
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      
      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <AudioPlayer key={peerId} stream={stream} />
      ))}

      {/* LOBBY UI */}
      {!hasJoined && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', 
          background: 'rgba(15, 23, 42, 0.7)', zIndex: 1000, 
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
          backdropFilter: 'blur(20px)' 
        }}>
          <div style={{
            background: '#1e293b', padding: '50px', borderRadius: '20px', 
            border: '1px solid #334155', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', 
            textAlign: 'center', width: '400px'
          }}>
            <h1 style={{ color: '#38bdf8', fontSize: '32px', margin: '0 0 10px 0' }}>SpatialConnect</h1>
            <p style={{ color: '#94a3b8', marginBottom: '10px' }}>Graphic Era University Campus</p>
            <p style={{ color: '#fbbf24', fontSize: '12px', marginBottom: '30px' }}>⚠️ Note: Browser may request mic access.</p>
            <input 
              value={usernameInput} 
              onChange={(e) => setUsernameInput(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleJoinGame()} 
              maxLength={15} 
              placeholder="Enter your username..." 
              style={{
                width: '100%', padding: '15px', borderRadius: '10px', border: '2px solid #334155', 
                background: '#0f172a', color: 'white', fontSize: '18px', outline: 'none', 
                marginBottom: '20px', textAlign: 'center'
              }} 
            />
            <button 
              onClick={handleJoinGame} 
              style={{
                width: '100%', padding: '15px', borderRadius: '10px', border: 'none', 
                background: '#10b981', color: 'white', fontSize: '18px', fontWeight: 'bold', 
                cursor: 'pointer'
              }}
            >
              Deploy to Campus
            </button>
          </div>
        </div>
      )}

      {/* GAME UI OVERLAYS */}
      {hasJoined && (
        <>
          <div style={{
            position: 'absolute', top: '20px', left: '20px', background: 'rgba(0,0,0,0.7)', 
            color: 'white', padding: '20px', borderRadius: '10px', zIndex: 10, 
            backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>🎓 SpatialConnect</h2>
            <p style={{ margin: '5px 0', fontSize: '14px', color: '#4ade80' }}>● Connected</p>
            <p style={{ margin: '5px 0', fontSize: '14px', color: '#ccc' }}>User: {players[myId]?.username || usernameInput}</p>
            <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '10px 0' }} />
            <p style={{ margin: '5px 0', fontSize: '14px', fontWeight: 'bold' }}>👥 Students Online: {Object.keys(players).length}</p>
            <p style={{ margin: '5px 0', fontSize: '14px', fontWeight: 'bold', color: voiceEnabled ? '#fbbf24' : '#ef4444' }}>
              {voiceEnabled ? '🎙️ Voice Active' : '🔇 Voice Disabled'}
            </p>
          </div>

          <div style={{
            position: 'absolute', bottom: '80px', left: '20px', width: '300px', height: '200px', 
            background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #334155', borderRadius: '10px', 
            zIndex: 10, display: 'flex', flexDirection: 'column', backdropFilter: 'blur(5px)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }}>Live Comms</span>
              <button 
                onClick={() => setChatLedger([])} 
                style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chatLedger.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic', margin: 'auto' }}>No messages yet...</p>
              ) : (
                chatLedger.map((chat) => (
                  <div key={chat.id} style={{
                    background: chat.sender === 'You' ? '#1e293b' : '#334155', padding: '8px 12px', 
                    borderRadius: '8px', width: 'fit-content', 
                    alignSelf: chat.sender === 'You' ? 'flex-end' : 'flex-start', maxWidth: '90%'
                  }}>
                    <span style={{ color: chat.sender === 'You' ? '#38bdf8' : '#fbbf24', fontSize: '11px', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>
                      {chat.sender}
                    </span>
                    <span style={{ color: 'white', fontSize: '14px', wordBreak: 'break-word' }}>
                      {chat.text}
                    </span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', gap: '10px' }}>
            <input 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)} 
              onKeyDown={sendChat} 
              placeholder="Type message & press Enter..." 
              style={{
                padding: '12px', width: '400px', borderRadius: '30px', border: 'none', 
                outline: 'none', background: 'rgba(0,0,0,0.8)', color: 'white', 
                fontSize: '16px', backdropFilter: 'blur(5px)'
              }} 
            />
            <button 
              onClick={() => startDictation('chat')} 
              style={{
                background: isDictatingChat ? '#ef4444' : '#3b82f6', border: 'none', 
                borderRadius: '50%', width: '45px', height: '45px', cursor: 'pointer', 
                fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              🎙️
            </button>
          </div>

          {nearbyHub && !isHubOpen && (
            <div style={{
              position: 'absolute', bottom: '150px', left: '50%', transform: 'translateX(-50%)', 
              background: '#fbbf24', color: 'black', padding: '15px 30px', borderRadius: '30px', 
              fontSize: '20px', fontWeight: 'bold', zIndex: 100, boxShadow: '0 0 20px rgba(251, 191, 36, 0.5)', 
              animation: 'pulse 1.5s infinite'
            }}>
              Press [E] to Enter {players[nearbyHub]?.username || nearbyHub.substring(0,4)}'s Hub
            </div>
          )}

          {isHubOpen && (
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', 
              background: 'rgba(15, 23, 42, 0.95)', zIndex: 500, display: 'flex', 
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{
                width: '80%', height: '80%', background: '#1e293b', borderRadius: '20px', 
                border: '1px solid #334155', display: 'flex', flexDirection: 'column', 
                overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              }}>
                <div style={{ padding: '20px 30px', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h1 style={{ margin: 0, color: '#38bdf8', fontSize: '24px' }}>
                    📁 Storage Hub: {players[nearbyHub]?.username || nearbyHub.substring(0,4)}
                  </h1>
                  <button 
                    onClick={() => setIsHubOpen(false)} 
                    style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Close [ESC]
                  </button>
                </div>
                
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                  <div style={{ width: '250px', borderRight: '1px solid #334155', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', background: '#0f172a' }}>
                    <button onClick={() => setHubTab('notes')} style={{ background: hubTab === 'notes' ? '#38bdf8' : 'transparent', color: hubTab === 'notes' ? '#0f172a' : '#cbd5e1', border: hubTab === 'notes' ? 'none' : '1px solid #334155', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'left' }}>📝 Shared Notes</button>
                    <button onClick={() => setHubTab('images')} style={{ background: hubTab === 'images' ? '#38bdf8' : 'transparent', color: hubTab === 'images' ? '#0f172a' : '#cbd5e1', border: hubTab === 'images' ? 'none' : '1px solid #334155', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'left' }}>🖼️ Image Gallery</button>
                  </div>

                  <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                    {hubTab === 'notes' && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                          <div>
                            <h2 style={{ margin: '0', color: 'white', fontSize: '18px' }}>Project Scratchpad</h2>
                            <p style={{ margin: '5px 0 0 0', color: '#10b981', fontSize: '14px', fontWeight: 'bold' }}>🟢 LIVE SYNC ACTIVE</p>
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleSummarize} style={{ background: '#8b5cf6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>✨ AI Summarize</button>
                            <button onClick={() => startDictation('notes')} style={{ background: isDictatingNotes ? '#ef4444' : '#3b82f6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>{isDictatingNotes ? '🔴 Recording...' : '🎙️ Dictate'}</button>
                          </div>
                        </div>
                        <textarea 
                          value={allHubData[nearbyHub]?.notes || ""} 
                          onChange={handleNotesChange} 
                          placeholder="Start typing or use the Dictate button." 
                          style={{ flex: 1, background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '10px', padding: '20px', fontSize: '16px', outline: 'none', resize: 'none', fontFamily: 'monospace' }} 
                        />
                      </>
                    )}

                    {hubTab === 'images' && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                          <div>
                            <h2 style={{ margin: '0', color: 'white', fontSize: '18px' }}>Shared Asset Gallery</h2>
                            <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>Upload diagrams or screenshots here.</p>
                          </div>
                          <label style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                            + Upload Image
                            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                          </label>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', padding: '10px 0' }}>
                          {(!allHubData[nearbyHub]?.images || allHubData[nearbyHub].images.length === 0) ? (
                            <p style={{ color: '#64748b', fontStyle: 'italic' }}>No images uploaded yet.</p>
                          ) : (
                            allHubData[nearbyHub].images.map((imgSrc, idx) => (
                              <div key={idx} style={{ width: '100%', height: '150px', background: '#0f172a', borderRadius: '10px', border: '1px solid #334155', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img src={imgSrc} alt={`Upload ${idx}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 🚀 HIGH-PERFORMANCE 3D ENGINE */}
      <Canvas shadows camera={{ position: [0, 5, 10], fov: 50 }}>
        
        <OrbitControls makeDefault enablePan={false} minDistance={3} maxDistance={60} maxPolarAngle={Math.PI / 2 - 0.05} />
        
        <Sky sunPosition={[50, 10, 10]} turbidity={0.2} rayleigh={0.8} /> 
        <fog attach="fog" args={['#87ceeb', 30, 150]} />
        <ambientLight intensity={0.6} />
        
        <directionalLight 
          position={[50, 30, 25]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[1024, 1024]} 
          shadow-camera-far={150} 
          shadow-camera-left={-50} 
          shadow-camera-right={50} 
          shadow-camera-top={50} 
          shadow-camera-bottom={-50} 
          shadow-bias={-0.0001}
          shadow-radius={3}
        />

        <Plane args={[300, 300]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
          <meshStandardMaterial color="#2d5a27" roughness={0.9} />
        </Plane>

        <Plane args={[20, 300]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow>
          <meshStandardMaterial color="#94a3b8" roughness={0.7} /> 
        </Plane>
        <Plane args={[300, 20]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
          <meshStandardMaterial color="#94a3b8" roughness={0.7} /> 
        </Plane>
        
        <Plane args={[300, 16]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </Plane>
        <Plane args={[16, 300]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </Plane>
        
        <Plane args={[0.2, 300]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
          <meshStandardMaterial color="white"/>
        </Plane>
        <Plane args={[300, 0.2]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
          <meshStandardMaterial color="white"/>
        </Plane>
        
        <CentralFountain />
        
        {CAMPUS_BUILDINGS.map((building, idx) => (
          <DetailedBuilding 
            key={`campus-bldg-${idx}`}
            name={building.name}
            pos={building.pos}
            dim={building.dim}
            color={building.color}
          />
        ))}

        <CanteenArea position={[65, 0, -20]} />
        <ParkingStall position={[-65, 0, 15]} />
        <ParkingStall position={[-65, 0, 25]} />

        <CampusProps />

        {Object.keys(players).map((id, index) => {
          const pos = getBuildingPosition(index);
          const ownerName = players[id]?.username || `User ${id.substring(0,4)}`;
          return <PlayerBuilding key={`hub-${id}`} id={id} index={index} position={pos} ownerName={ownerName} />;
        })}

        {environmentProps.map((prop, idx) => {
          if (prop.type === 'tree') return <Tree key={`tree-${idx}`} position={prop.pos} />;
          if (prop.type === 'light') return <StreetLight key={`light-${idx}`} position={prop.pos} />;
          return null;
        })}

        {Object.keys(players).map((id) => (
          <Avatar 
            key={id}
            id={id} 
            position={players[id]} 
            serverAction={players[id].action}
            color={id === myId ? "#3b82f6" : "#ef4444"} 
            isMain={id === myId} 
            hasJoined={hasJoined} 
            onMove={(pos) => socket?.emit('playerMovement', pos)} 
            chatMsg={id === myId ? myMsg : players[id].msg} 
            playersList={players}
            onNearHub={(hubId) => {
              if (id === myId && hubId !== nearbyHub) setNearbyHub(hubId);
            }}
          />
        ))}
      </Canvas>
    </div>
  );
}
