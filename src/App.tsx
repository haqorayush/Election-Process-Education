import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';
import {
  Bot,
  CalendarDays,
  CheckCircle,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Info,
  Map,
  MapPin,
  MessageSquare,
  Moon,
  Send,
  Sparkles,
  Sun,
  User,
  X
} from 'lucide-react';
import jsPDF from 'jspdf';
import ReactMarkdown from 'react-markdown';

type ChatMode = 'guided' | 'ai';
type Sender = 'user' | 'bot';
type Stage = 'unknown' | 'eligible_not_registered' | 'registered' | 'ready_to_vote' | 'completed' | 'not_eligible';

type ApiActionName =
  | 'show_checklist'
  | 'start_simulation'
  | 'offer_simulation'
  | 'show_electoral_roll_link'
  | 'show_timeline'
  | 'show_celebration';

type ApiAction = {
  type: 'ui_action' | string;
  name: ApiActionName | string;
};

type Message = {
  sender: Sender;
  text: string;
  actions?: ApiAction[];
  suggestions?: string[];
};

type BackendState = {
  age: number | null;
  location: string | null;
  has_voter_id: string;
  stage: Stage;
  simulation_step: 'id_check' | 'evm_machine' | null;
  next_step?: string;
};

type ChatResponse = {
  message: string;
  stage: Stage;
  next_step?: string;
  actions?: ApiAction[];
  suggestions?: string[];
};

type SendOptions = {
  showUserMessage?: boolean;
  replaceMessages?: boolean;
  languageOverride?: string;
};

const initialUserState: BackendState = {
  age: null,
  location: null,
  has_voter_id: 'unknown',
  stage: 'unknown',
  simulation_step: null
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3000');

const apiUrl = (path: string) => `${apiBase}${path}`;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init);
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

const inferNextStep = (state: BackendState): string => {
  if (state.next_step) return state.next_step;
  if (state.simulation_step === 'id_check') return 'simulation_id_check';
  if (state.simulation_step === 'evm_machine') return 'simulation_evm';

  switch (state.stage) {
    case 'unknown':
      return 'confirm_age';
    case 'eligible_not_registered':
      return 'check_voter_id';
    case 'registered':
      return 'check_electoral_roll';
    case 'ready_to_vote':
      return 'prepare_for_voting';
    case 'not_eligible':
      return 'offer_education';
    case 'completed':
      return 'none';
    default:
      return 'confirm_age';
  }
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiMessages, setAiMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [userState, setUserState] = useState<BackendState>(initialUserState);
  const [typingMode, setTypingMode] = useState<ChatMode | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [language, setLanguage] = useState('en');
  const [showMap, setShowMap] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('guided');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(false);

  const t = useMemo(() => ({
    journey: language === 'en' ? 'Your Journey' : 'आपकी यात्रा',
    tagline: language === 'en' ? 'Your intelligent guide to the Indian election process.' : 'भारतीय चुनाव प्रक्रिया के लिए आपका बुद्धिमान मार्गदर्शक।',
    assistant: language === 'en' ? 'Civic Assistant' : 'नागरिक सहायक',
    placeholder: chatMode === 'ai'
      ? (language === 'en' ? 'Ask anything about elections...' : 'चुनावों के बारे में कुछ भी पूछें...')
      : (language === 'en' ? 'Type your response or ask a question...' : 'अपनी प्रतिक्रिया टाइप करें या प्रश्न पूछें...'),
    checklist: language === 'en' ? 'Form-6 Checklist' : 'फॉर्म-6 चेकलिस्ट',
    pollingBooth: language === 'en' ? 'Polling Booth' : 'मतदान केंद्र',
    timeline: language === 'en' ? 'Election Timeline' : 'चुनाव समयरेखा',
    locating: language === 'en' ? 'Locating...' : 'स्थान ढूंढ रहे हैं...',
    nextStep: language === 'en' ? 'Next step' : 'अगला कदम',
    voterId: language === 'en' ? 'Voter ID' : 'मतदाता आईडी',
    unknown: language === 'en' ? 'Unknown' : 'अज्ञात',
    ready: language === 'en' ? 'Ready' : 'तैयार',
    notYet: language === 'en' ? 'Not yet' : 'अभी नहीं',
    futureReady: language === 'en' ? 'Future prep' : 'भविष्य की तैयारी',
    aiUnavailable: language === 'en'
      ? 'Sorry, I could not connect to the AI service. Please try again.'
      : 'क्षमा करें, मैं AI सेवा से कनेक्ट नहीं कर सका। कृपया फिर कोशिश करें।',
    guidedUnavailable: language === 'en'
      ? 'Sorry, I could not reach VoteGuide AI. Please try again.'
      : 'क्षमा करें, VoteGuide AI से कनेक्ट नहीं हो सका। कृपया फिर कोशिश करें।'
  }), [chatMode, language]);

  const aiGreeting = useMemo<Message>(() => ({
    sender: 'bot',
    text: language === 'hi'
      ? '**AI सहायक मोड** - भारतीय चुनाव प्रक्रिया, मतदान अधिकार, लोकतंत्र, ईवीएम मशीनों या नागरिक शिक्षा के बारे में मुझसे कुछ भी पूछें। मैं Google Gemini द्वारा संचालित हूं!'
      : "**AI Assistant Mode** - Ask me anything about the Indian election process, voting rights, democracy, EVM machines, or civic education. I'm powered by Google Gemini!"
  }), [language]);

  const applyGuidedResponse = useCallback((data: ChatResponse): Message => {
    const actions = data.actions ?? [];
    const actionNames = actions.map(action => action.name);

    if (actionNames.includes('show_timeline')) {
      setShowTimeline(true);
    }

    if (actionNames.includes('show_celebration')) {
      setShowCelebration(true);
      window.setTimeout(() => setShowCelebration(false), 5000);
    }

    setUserState(previous => ({
      ...previous,
      stage: data.stage,
      next_step: data.next_step ?? inferNextStep({ ...previous, stage: data.stage }),
      simulation_step: data.next_step === 'simulation_id_check'
        ? 'id_check'
        : data.next_step === 'simulation_evm'
          ? 'evm_machine'
          : previous.simulation_step
    }));

    return {
      sender: 'bot',
      text: data.message,
      actions,
      suggestions: data.suggestions ?? []
    };
  }, []);

  const sendGuidedMessage = useCallback(async (messageText: string, options: SendOptions = {}) => {
    const textToSend = messageText.trim();
    if (!textToSend) return;

    const showUserMessage = options.showUserMessage ?? true;
    const replaceMessages = options.replaceMessages ?? false;

    if (replaceMessages) {
      setMessages(showUserMessage ? [{ sender: 'user', text: textToSend }] : []);
    } else if (showUserMessage) {
      setMessages(previous => [...previous, { sender: 'user', text: textToSend }]);
    }

    setInputMessage('');
    setTypingMode('guided');

    try {
      const data = await requestJson<ChatResponse>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend, language: options.languageOverride ?? language })
      });
      const botMessage = applyGuidedResponse(data);

      window.setTimeout(() => {
        setTypingMode(null);
        setMessages(previous => replaceMessages && !showUserMessage ? [botMessage] : [...previous, botMessage]);
      }, 350);
    } catch (error) {
      console.error('Error connecting to VoteGuide AI:', error);
      setTypingMode(null);
      setMessages(previous => [...previous, { sender: 'bot', text: t.guidedUnavailable }]);
    }
  }, [applyGuidedResponse, language, t.guidedUnavailable]);

  const sendAiMessage = useCallback(async (messageText: string) => {
    const textToSend = messageText.trim();
    if (!textToSend) return;

    setAiMessages(previous => [
      ...(previous.length === 0 ? [aiGreeting] : previous),
      { sender: 'user', text: textToSend }
    ]);
    setInputMessage('');
    setTypingMode('ai');

    try {
      const data = await requestJson<{ message: string }>('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend, language })
      });

      window.setTimeout(() => {
        setTypingMode(null);
        setAiMessages(previous => [...previous, { sender: 'bot', text: data.message }]);
      }, 350);
    } catch (error) {
      console.error('Error connecting to AI:', error);
      setTypingMode(null);
      setAiMessages(previous => [...previous, { sender: 'bot', text: t.aiUnavailable }]);
    }
  }, [aiGreeting, language, t.aiUnavailable]);

  const handleSend = useCallback((messageText?: string) => {
    const textToSend = messageText ?? inputMessage;

    if (chatMode === 'ai') {
      void sendAiMessage(textToSend);
      return;
    }

    void sendGuidedMessage(textToSend);
  }, [chatMode, inputMessage, sendAiMessage, sendGuidedMessage]);

  const initializeGuidedSession = useCallback(async (targetLanguage = language) => {
    setTypingMode('guided');

    try {
      const backendState = await requestJson<BackendState>('/api/state');
      const hydratedState = {
        ...initialUserState,
        ...backendState,
        next_step: inferNextStep(backendState)
      };
      setUserState(hydratedState);
      await sendGuidedMessage('hello', {
        showUserMessage: false,
        replaceMessages: true,
        languageOverride: targetLanguage
      });
    } catch (error) {
      console.error('Error hydrating backend state:', error);
      setTypingMode(null);
      setMessages([{ sender: 'bot', text: t.guidedUnavailable }]);
    }
  }, [language, sendGuidedMessage, t.guidedUnavailable]);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void initializeGuidedSession();
  }, [initializeGuidedSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, aiMessages.length, chatMode, typingMode]);

  const handleFindPollingBooth = useCallback(() => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setIsLocating(false);
          setShowMap(true);
        },
        (error) => {
          console.error('Error fetching location:', error);
          setUserLocation({ lat: 28.6139, lng: 77.2090 });
          setIsLocating(false);
          setShowMap(true);
        }
      );
    } else {
      setUserLocation({ lat: 28.6139, lng: 77.2090 });
      setIsLocating(false);
      setShowMap(true);
    }
  }, []);

  const downloadPDF = useCallback(() => {
    const doc = new jsPDF();
    const primaryColor: [number, number, number] = [109, 40, 217];
    const textColor: [number, number, number] = [30, 30, 50];
    const mutedColor: [number, number, number] = [100, 100, 120];

    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('VoteGuide AI', 14, 16);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Form-6 Voter Registration Checklist', 14, 28);
    doc.text('Election Commission of India', 14, 35);

    doc.setTextColor(...textColor);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Required Documents', 14, 55);

    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.5);
    doc.line(14, 58, 196, 58);

    const items = [
      { label: '1. Passport Size Photograph', detail: '(Recent, white background, 2 copies)' },
      { label: '2. Identity Proof', detail: 'Aadhaar Card / PAN Card / Passport / Driving License' },
      { label: '3. Address Proof', detail: 'Utility bill / Bank passbook / Registered rent agreement' },
      { label: '4. Age Proof', detail: '10th/12th marksheet / Birth certificate / Aadhaar / PAN' }
    ];

    let y = 70;
    items.forEach(item => {
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.6);
      doc.rect(14, y - 5, 5, 5);

      doc.setTextColor(...textColor);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(item.label, 23, y);
      y += 6;
      doc.setTextColor(...mutedColor);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(item.detail, 23, y);
      y += 12;
    });

    y += 4;
    doc.setDrawColor(...primaryColor);
    doc.setFillColor(240, 235, 255);
    doc.roundedRect(14, y, 182, 28, 4, 4, 'FD');
    doc.setTextColor(...primaryColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Apply Online', 20, y + 9);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Visit: https://voters.eci.gov.in', 20, y + 17);
    doc.text('Use Form 6 for first-time voter registration.', 20, y + 23);

    doc.setTextColor(...mutedColor);
    doc.setFontSize(8);
    doc.text('Generated by VoteGuide AI - Hack2Skill x Google for Developers', 14, 285);
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 160, 285);

    doc.save('Form6_Checklist_VoteGuideAI.pdf');
  }, []);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    handleSend(suggestion);
  }, [handleSend]);

  const handleLanguageToggle = useCallback(() => {
    const nextLanguage = language === 'en' ? 'hi' : 'en';
    setLanguage(nextLanguage);
    setMessages([]);
    setAiMessages([]);
    void initializeGuidedSession(nextLanguage);
  }, [initializeGuidedSession, language]);

  const handleTimelineRequest = useCallback(() => {
    setChatMode('guided');
    void sendGuidedMessage('show_timeline', { showUserMessage: false });
  }, [sendGuidedMessage]);

  const currentMessages = useMemo(() => (
    chatMode === 'guided' ? messages : (aiMessages.length > 0 ? aiMessages : [aiGreeting])
  ), [aiGreeting, aiMessages, chatMode, messages]);

  const stepLabel = useMemo(() => {
    const labels: Record<string, { en: string; hi: string }> = {
      confirm_age: { en: 'Confirm age eligibility', hi: 'आयु पात्रता पुष्टि' },
      check_voter_id: { en: 'Check Voter ID status', hi: 'मतदाता आईडी स्थिति जांचें' },
      apply_voter_id: { en: 'Apply with Form 6', hi: 'फॉर्म 6 से आवेदन करें' },
      check_electoral_roll: { en: 'Verify electoral roll', hi: 'मतदाता सूची सत्यापित करें' },
      prepare_for_voting: { en: 'Prepare for polling day', hi: 'मतदान दिवस की तैयारी' },
      simulation_id_check: { en: 'Booth ID check', hi: 'बूथ आईडी जांच' },
      simulation_evm: { en: 'EVM walkthrough', hi: 'ईवीएम अभ्यास' },
      simulation_complete: { en: 'Simulation complete', hi: 'अभ्यास पूरा' },
      go_vote: { en: 'Ready to vote', hi: 'मतदान के लिए तैयार' },
      review_timeline: { en: 'Review timeline', hi: 'समयरेखा देखें' },
      offer_education: { en: 'Future voter education', hi: 'भविष्य मतदाता शिक्षा' },
      future_registration: { en: 'Prepare for future registration', hi: 'भविष्य पंजीकरण तैयारी' },
      gemini_answered: { en: 'Open Q&A', hi: 'खुला सवाल-जवाब' },
      none: { en: 'Journey complete', hi: 'यात्रा पूरी' }
    };
    const nextStep = userState.next_step ?? inferNextStep(userState);
    return labels[nextStep]?.[language as 'en' | 'hi'] ?? nextStep.replaceAll('_', ' ');
  }, [language, userState]);

  const voterIdStatus = useMemo(() => {
    if (userState.has_voter_id === 'yes') return t.ready;
    if (userState.stage === 'eligible_not_registered' || userState.has_voter_id === 'no') return t.notYet;
    return t.unknown;
  }, [t.notYet, t.ready, t.unknown, userState.has_voter_id, userState.stage]);

  const renderTimeline = () => {
    const stages = [
      { id: 'unknown', label: language === 'en' ? 'Start' : 'प्रारंभ' },
      { id: 'eligible_not_registered', label: language === 'en' ? 'Eligibility' : 'पात्रता' },
      { id: 'registered', label: language === 'en' ? 'Registration' : 'पंजीकरण' },
      { id: 'ready_to_vote', label: language === 'en' ? 'Preparation' : 'तैयारी' },
      { id: 'completed', label: language === 'en' ? 'Voted!' : 'मतदान किया!' }
    ];

    const activeStage = userState.stage === 'not_eligible' ? 'eligible_not_registered' : userState.stage;
    const activeIndex = Math.max(stages.findIndex(stage => stage.id === activeStage), 0);

    return (
      <div className="timeline-container">
        {stages.map((stage, index) => (
          <motion.div
            key={stage.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: index <= activeIndex ? 1 : 0.6, x: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            className={`timeline-node ${index <= activeIndex ? 'active' : ''}`}
          >
            <div className="node-circle">{index <= activeIndex ? <CheckCircle size={14} /> : index + 1}</div>
            <span className="node-label">{userState.stage === 'not_eligible' && index === 1 ? t.futureReady : stage.label}</span>
            {index < stages.length - 1 && <div className={`node-line ${index < activeIndex ? 'active-line' : ''}`} />}
          </motion.div>
        ))}
      </div>
    );
  };

  const renderAction = (act: ApiAction, index: number) => {
    if (act.name === 'show_checklist') {
      return (
        <div key={index} className="action-pill">
          <span className="pill"><FileText size={14} /> {language === 'en' ? 'Checklist Available in Panel' : 'चेकलिस्ट पैनल में उपलब्ध है'}</span>
        </div>
      );
    }

    if (act.name === 'start_simulation') {
      return (
        <div key={index} className="action-pill">
          <span className="pill highlight"><Info size={14} /> {language === 'en' ? 'Simulation Started' : 'अभ्यास शुरू हुआ'}</span>
        </div>
      );
    }

    if (act.name === 'offer_simulation') {
      return (
        <div key={index} className="action-pill">
          <button className="pill highlight action-button-pill" onClick={() => handleSend('start_simulation')}>
            <Info size={14} /> {language === 'en' ? 'Start Walkthrough' : 'वॉकथ्रू शुरू करें'}
          </button>
        </div>
      );
    }

    if (act.name === 'show_electoral_roll_link') {
      return (
        <div key={index} className="action-pill">
          <a href="https://electoralsearch.eci.gov.in/" target="_blank" rel="noopener noreferrer" className="pill highlight">
            <ExternalLink size={14} /> {language === 'en' ? 'Search Electoral Roll' : 'मतदाता सूची खोजें'}
          </a>
        </div>
      );
    }

    if (act.name === 'show_timeline') {
      return (
        <div key={index} className="action-pill">
          <button className="pill highlight action-button-pill" onClick={() => setShowTimeline(true)}>
            <CalendarDays size={14} /> {t.timeline}
          </button>
        </div>
      );
    }

    if (act.name === 'show_celebration') {
      return (
        <div key={index} className="action-pill">
          <span className="pill highlight"><Sparkles size={14} /> {language === 'en' ? 'Journey Complete' : 'यात्रा पूरी'}</span>
        </div>
      );
    }

    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="app-container"
    >
      <div className="sidebar">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="brand"
        >
          <MapPin className="brand-icon" />
          <h1>VoteGuide AI</h1>
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="tagline"
        >
          {t.tagline}
        </motion.p>

        <div className="progress-section">
          <motion.h3 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>{t.journey}</motion.h3>
          {renderTimeline()}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="journey-status"
        >
          <div>
            <span>{t.nextStep}</span>
            <strong>{stepLabel}</strong>
          </div>
          <div>
            <span>{t.voterId}</span>
            <strong>{voterIdStatus}</strong>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="quick-actions"
        >
          <button className="quick-action-btn" onClick={downloadPDF} title={t.checklist}>
            <Download size={16} />
            <span>{t.checklist}</span>
          </button>
          <button className="quick-action-btn" onClick={handleTimelineRequest} title={t.timeline}>
            <CalendarDays size={16} />
            <span>{t.timeline}</span>
          </button>
          <button className="quick-action-btn" onClick={handleFindPollingBooth} title={t.pollingBooth}>
            <Map size={16} />
            <span>{isLocating ? t.locating : t.pollingBooth}</span>
          </button>
        </motion.div>

        <div className="info-cards">
          <AnimatePresence mode="wait">
            {(userState.stage === 'eligible_not_registered' || userState.stage === 'not_eligible') && (
              <motion.div
                key="checklist"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="card glass"
              >
                <div style={{ padding: '0.5rem' }}>
                  <h4><FileText size={18} /> {t.checklist}</h4>
                  <ul>
                    <li>Passport size photo</li>
                    <li>Identity proof (Aadhaar, PAN)</li>
                    <li>Address proof</li>
                    <li>Age proof</li>
                  </ul>
                </div>
                <button className="btn-secondary" onClick={downloadPDF}>
                  <Download size={16} /> Download PDF
                </button>
              </motion.div>
            )}
            {userState.stage === 'ready_to_vote' && (
              <motion.div
                key="simulation"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="card glass action-card"
              >
                <h4><Info size={18} /> Interactive Simulation</h4>
                <p>Experience voting day step-by-step.</p>
                <button className="btn-secondary" onClick={() => handleSend('start_simulation')}>Start Walkthrough</button>

                <button className="btn-secondary outline" onClick={handleFindPollingBooth}>
                  <Map size={16} /> {isLocating ? t.locating : t.pollingBooth}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="main-chat">
        <div className="chat-header">
          <h2>{t.assistant}</h2>
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="status-indicator"
          />

          <div className="chat-tabs">
            <button className={`chat-tab ${chatMode === 'guided' ? 'active' : ''}`} onClick={() => setChatMode('guided')}>
              <MessageSquare size={14} />
              <span>Guided</span>
            </button>
            <button className={`chat-tab ${chatMode === 'ai' ? 'active' : ''}`} onClick={() => setChatMode('ai')}>
              <Bot size={14} />
              <span>AI Chat</span>
            </button>
          </div>

          <div className="header-actions">
            <button className="theme-toggle language-toggle" onClick={handleLanguageToggle} title="Toggle Language">
              <Globe size={18} />
              <span>{language.toUpperCase()}</span>
            </button>
            <button className="theme-toggle" onClick={() => setIsDarkMode(!isDarkMode)} title="Toggle Theme">
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        <div className="messages-area">
          <AnimatePresence initial={false}>
            {currentMessages.map((msg, idx) => (
              <motion.div
                key={`${chatMode}-${idx}`}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className={`message-wrapper ${msg.sender}`}
              >
                {msg.sender === 'bot' && <div className="avatar bot-avatar">{chatMode === 'ai' ? <Bot size={16} /> : <MapPin size={16} />}</div>}
                <div className={`message bubble ${msg.sender}`}>
                  {msg.sender === 'bot' ? (
                    <div className="markdown-body">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <p>{msg.text}</p>
                  )}

                  {msg.actions?.map(renderAction)}

                  {msg.sender === 'bot' && msg.suggestions && msg.suggestions.length > 0 && idx === currentMessages.length - 1 && (
                    <div className="suggestion-buttons">
                      {msg.suggestions.map((suggestion, sIdx) => (
                        <motion.button
                          key={suggestion}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 * sIdx + 0.3 }}
                          className="suggestion-btn"
                          onClick={() => handleSuggestionClick(suggestion)}
                        >
                          {suggestion}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>
                {msg.sender === 'user' && <div className="avatar user-avatar"><User size={16} /></div>}
              </motion.div>
            ))}
            {typingMode === chatMode && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="message-wrapper bot"
              >
                <div className="avatar bot-avatar">{chatMode === 'ai' ? <Bot size={16} /> : <MapPin size={16} />}</div>
                <div className="message bubble bot typing">
                  <div className="dot" /><div className="dot" /><div className="dot" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <input
            type="text"
            placeholder={t.placeholder}
            value={inputMessage}
            onChange={(event) => setInputMessage(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSend()}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="send-btn"
            onClick={() => handleSend()}
          >
            <Send size={18} />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="celebration-banner"
          >
            <Sparkles size={18} />
            <span>{language === 'en' ? 'Election journey complete' : 'चुनाव यात्रा पूरी'}</span>
            <button onClick={() => setShowCelebration(false)}><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTimeline && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowTimeline(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="modal-content timeline-modal"
              onClick={event => event.stopPropagation()}
            >
              <button className="modal-close" onClick={() => setShowTimeline(false)}>
                <X size={24} />
              </button>
              <h3><CalendarDays size={24} color="var(--primary)" /> {t.timeline}</h3>
              <div className="timeline-list">
                <div><strong>Form 6</strong><span>{language === 'en' ? 'Register before the electoral roll cutoff for your constituency.' : 'अपने क्षेत्र की मतदाता सूची कटऑफ से पहले पंजीकरण करें।'}</span></div>
                <div><strong>Roll check</strong><span>{language === 'en' ? 'Verify your name after application approval and before polling day.' : 'आवेदन स्वीकृति के बाद और मतदान से पहले अपना नाम जांचें।'}</span></div>
                <div><strong>Polling day</strong><span>{language === 'en' ? 'Carry Voter ID or another approved photo ID to the booth.' : 'मतदान केंद्र पर मतदाता आईडी या स्वीकृत फोटो आईडी साथ रखें।'}</span></div>
              </div>
              <a href="https://voters.eci.gov.in/" target="_blank" rel="noopener noreferrer" className="btn-secondary modal-link">
                <ExternalLink size={16} /> Voters' Service Portal
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowMap(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="modal-content"
              onClick={event => event.stopPropagation()}
            >
              <button className="modal-close" onClick={() => setShowMap(false)}>
                <X size={24} />
              </button>
              <h3><MapPin size={24} color="var(--primary)" /> Polling Booth Location</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>Your designated polling booth has been located. You can view it below or copy the Google Maps link to your phone.</p>

              {userLocation && (
                <>
                  <iframe
                    width="100%"
                    height="300"
                    style={{ border: 0, borderRadius: '12px' }}
                    loading="lazy"
                    allowFullScreen
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${userLocation.lng - 0.005}%2C${userLocation.lat - 0.005}%2C${userLocation.lng + 0.005}%2C${userLocation.lat + 0.005}&layer=mapnik&marker=${userLocation.lat + 0.001}%2C${userLocation.lng + 0.001}`}
                  />

                  <button
                    className="btn-secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(`https://www.google.com/maps/search/?api=1&query=${userLocation.lat + 0.001},${userLocation.lng + 0.001}`);
                      window.alert('Google Maps Link Copied!');
                    }}
                  >
                    <Copy size={18} /> Copy Google Maps Link
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default App;
