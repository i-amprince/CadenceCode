import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';

export default function VoiceChat({ roomId, userList }) {
  const [isMuted, setIsMuted] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [speaking, setSpeaking] = useState({});
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const audioElementsRef = useRef({});
  const audioCtxRef = useRef(null); // Shared AudioContext

  // --- WebRTC Signaling ---
  useEffect(() => {
    let mounted = true;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new window.AudioContext();
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (!mounted) return;
      localStreamRef.current = stream;
      // Set initial mute state
      stream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
      setVoiceReady(true);

      socket.emit('VOICE_JOIN', { roomId });

      socket.on('VOICE_USERS', users => {
        users.forEach(userId => {
          if (userId === socket.id) return;
          if (!peersRef.current[userId]) {
            const pc = createPeerConnection(userId, true);
            peersRef.current[userId] = pc;
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
          }
        });
      });

      socket.on('VOICE_SIGNAL', async ({ from, data }) => {
        let pc = peersRef.current[from];
        if (!pc) {
          pc = createPeerConnection(from, false);
          peersRef.current[from] = pc;
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
        }
        if (data.sdp) {
          try {
            await pc.setRemoteDescription(new window.RTCSessionDescription(data.sdp));
            if (data.sdp.type === 'offer') {
              // Only answer if not already have a local description
              if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('VOICE_SIGNAL', { to: from, from: socket.id, data: { sdp: pc.localDescription } });
              }
            }
          } catch (e) {
            // Ignore errors from duplicate/late offers
          }
        } else if (data.candidate) {
          try {
            await pc.addIceCandidate(new window.RTCIceCandidate(data.candidate));
          } catch (e) {}
        }
      });
    });

    return () => {
      mounted = false;
      Object.values(peersRef.current).forEach(pc => pc.close());
      Object.values(audioElementsRef.current).forEach(audio => audio.remove());
      socket.off('VOICE_USERS');
      socket.off('VOICE_SIGNAL');
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      peersRef.current = {};
      audioElementsRef.current = {};
    };
  }, [roomId]);

  // --- Mute/Unmute ---
  const toggleMute = () => {
    if (localStreamRef.current) {
      const newMuted = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted;
      });
      setIsMuted(newMuted);
    }
  };

  function createPeerConnection(peerId, isInitiator) {
    const pc = new window.RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = event => {
      if (event.candidate) {
        socket.emit('VOICE_SIGNAL', { to: peerId, from: socket.id, data: { candidate: event.candidate } });
      }
    };

    pc.ontrack = event => {
      let audio = audioElementsRef.current[peerId];
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.id = `audio-${peerId}`;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        audioElementsRef.current[peerId] = audio;
      }
      audio.srcObject = event.streams[0];
      // Speaking detection using shared AudioContext
      const analyser = audioCtxRef.current.createAnalyser();
      const src = audioCtxRef.current.createMediaStreamSource(event.streams[0]);
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      function checkSpeaking() {
        analyser.getByteFrequencyData(data);
        const vol = data.reduce((a, b) => a + b, 0) / data.length;
        setSpeaking(s => ({ ...s, [peerId]: vol > 10 }));
        requestAnimationFrame(checkSpeaking);
      }
      checkSpeaking();
    };

    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('VOICE_SIGNAL', { to: peerId, from: socket.id, data: { sdp: pc.localDescription } });
        } catch (e) {
          // Ignore negotiation errors
        }
      };
    }

    return pc;
  }

  // --- UI: Show mic icon on hover for self ---
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ color: '#4aee88', marginBottom: 8 }}>Voice Chat</h4>
      <div className="voiceUserList" style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {userList.map(u => (
            <li
              key={u.socketId}
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 8,
                background: speaking[u.socketId] ? 'rgba(74,238,136,0.08)' : 'transparent',
                borderRadius: 6,
                padding: '4px 8px'
              }}
            >
              {u.picture ? (
                <img
                  src={u.picture}
                  alt={u.username}
                  style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover', marginRight: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }}
                />
              ) : (
                <span style={{ width: 28, height: 28, borderRadius: 8, background: '#4aee88', color: '#1c1c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 15, marginRight: 8 }}>{u.username?.[0]?.toUpperCase()}</span>
              )}
              <span>{u.username}</span>
              {u.socketId === socket.id ? (
                <span
                  style={{ marginLeft: 8, cursor: 'pointer' }}
                  title={isMuted ? 'Unmute' : 'Mute'}
                  onMouseEnter={e => e.currentTarget.style.opacity = 1}
                  onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
                  onClick={toggleMute}
                >
                  {isMuted ? '🔇' : '🎤'}
                </span>
              ) : (
                <span style={{ marginLeft: 8 }}>
                  {speaking[u.socketId] ? '🗣️' : '🔈'}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {!voiceReady && <div style={{ color: '#aaa', fontSize: 12 }}>Allow microphone to join voice chat</div>}
    </div>
  );
}