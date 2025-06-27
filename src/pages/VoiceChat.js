import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import Avatar from 'react-avatar';

export default function VoiceChat({ roomId, userList, showHeader = true }) {
  const [isMuted, setIsMuted] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [speaking, setSpeaking] = useState({});
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const audioElementsRef = useRef({});
  const audioCtxRef = useRef(null); //audio context newwly learned

  // webrtc thing
  useEffect(() => {
    let mounted = true;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new window.AudioContext();
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (!mounted) return;
      localStreamRef.current = stream;
      
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
              
              if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('VOICE_SIGNAL', { to: from, from: socket.id, data: { sdp: pc.localDescription } });
              }
            }
          } catch (e) {
              console.log(e);
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

 //second last update doingggg
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
      
      //audio context used here to check whether someone is speaking or not
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
          console.log(e);// update later
        }
      };
    }

    return pc;
  }

  
  const [imgError, setImgError] = useState({});

  return (
    <div className="voiceChatOuter" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {showHeader && (
        <h4 style={{ color: '#4aee88', marginBottom: 8 }}>Voice Chat</h4>
      )}
      <div className="voiceUserList" style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginBottom: 8 }}>
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
              <Avatar
                name={u.username}
                src={u.picture && !imgError[u.socketId] ? u.picture : null}
                size="28"
                round="8px"
                onError={() => setImgError(prev => ({ ...prev, [u.socketId]: true }))}
                style={{ marginRight: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }}
              />
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