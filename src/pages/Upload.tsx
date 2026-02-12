import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ParticleBackground } from "@/components/ParticleBackground";
import { useAnalyzeContent } from "@/hooks/useAnalyzeContent";
import { uploadAudio } from "@/api/audio";
import { toast } from "sonner";
import {
  FileText,
  Upload as UploadIcon,
  Mic,
  Sparkles,
  ArrowRight,
  X,
  CheckCircle2,
  Loader2,
  Brain,
  Wand2,
  Radio,
  Computer,
  UploadCloud,
  Square,
  Circle,
} from "lucide-react";

type InputMethod = "text" | "pdf" | "audio";
type AudioMode = "mic" | "upload" | "system";

const UploadPage = () => {
  const navigate = useNavigate();
  const [activeMethod, setActiveMethod] = useState<InputMethod>("text");
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { analyze, isAnalyzing } = useAnalyzeContent();
  
  // Audio states
  const [audioMode, setAudioMode] = useState<AudioMode>("mic");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  
  // Refs for recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);

  const inputMethods = [
    { id: "text" as InputMethod, icon: FileText, label: "Paste Text", description: "Copy & paste your content" },
    { id: "pdf" as InputMethod, icon: UploadIcon, label: "Upload PDF", description: "Upload document files" },
    { id: "audio" as InputMethod, icon: Mic, label: "Audio", description: "Record or upload audio" },
  ];

  const audioModes = [
    { id: "mic" as AudioMode, icon: Mic, label: "Microphone", description: "Record from your mic" },
    { id: "upload" as AudioMode, icon: UploadCloud, label: "Upload Audio", description: "Upload audio file" },
    { id: "system" as AudioMode, icon: Radio, label: "System Audio", description: "Record meeting audio" },
  ];

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Timer for recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Start microphone recording
  const startMicRecording = async () => {
    if (isRecording || isProcessing) {
      toast.warning("Please wait for current operation to complete");
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      
      // Check if MediaRecorder supports the mimeType
      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = ""; // Use default
        }
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        isRecordingRef.current = false;
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
        const audioFile = new File([audioBlob], `recording-${Date.now()}.webm`, { type: mimeType || "audio/webm" });
        setAudioFile(audioFile);
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        await processAudio(audioFile);
      };

      mediaRecorder.start();
      setIsRecording(true);
      isRecordingRef.current = true;
      setRecordingTime(0);
      toast.success("Recording started");
    } catch (error) {
      console.error("Error starting mic recording:", error);
      toast.error("Failed to start recording", {
        description: "Please allow microphone access",
      });
    }
  };

  // Start system audio recording (for meetings)
  const startSystemRecording = async () => {
    if (isRecording || isProcessing) {
      toast.warning("Please wait for current operation to complete");
      return;
    }
    
    try {
      // Check if getDisplayMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("Screen capture API is not supported in this browser");
      }

      // Request screen share with audio to capture system audio
      // Note: Some browsers require video: true even if we only want audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser" as ConstrainDOMString,
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false,
        } as MediaTrackConstraints,
      });
      
      // Check if we got an audio track
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        // Stop video tracks if we only want audio
        stream.getVideoTracks().forEach(track => track.stop());
        throw new Error("No audio track available. Please select an audio source in the browser prompt.");
      }

      // Stop video tracks immediately if we only want audio
      stream.getVideoTracks().forEach(track => {
        track.stop();
        stream.removeTrack(track);
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];

      // Handle when user stops sharing from browser
      stream.getTracks().forEach(track => {
        track.onended = () => {
          if (isRecordingRef.current && mediaRecorderRef.current?.state === "recording") {
            stopRecording();
          }
        };
      });

      // Check if MediaRecorder supports the mimeType
      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = ""; // Use default
        }
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        isRecordingRef.current = false;
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const audioFile = new File([audioBlob], `system-recording-${Date.now()}.webm`, { type: "audio/webm" });
        setAudioFile(audioFile);
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        await processAudio(audioFile);
      };

      mediaRecorder.start();
      setIsRecording(true);
      isRecordingRef.current = true;
      setRecordingTime(0);
      toast.success("System audio recording started", {
        description: "Select the audio source in the browser prompt",
      });
    } catch (error) {
      console.error("Error starting system recording:", error);
      const errorName = (error as Error).name;
      const errorMessage = (error as Error).message;
      
      if (errorName === "NotAllowedError") {
        toast.error("Permission denied", {
          description: "Please allow screen/audio sharing in the browser prompt",
        });
      } else if (errorName === "NotSupportedError" || errorMessage.includes("not supported")) {
        toast.error("System audio recording not supported", {
          description: "Your browser may not support system audio capture. Try using Chrome or Edge.",
        });
      } else {
        toast.error("Failed to start system recording", {
          description: errorMessage || "Unknown error occurred",
        });
      }
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && (isRecording || isRecordingRef.current)) {
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      isRecordingRef.current = false;
      toast.info("Processing audio...");
    }
  };

  // Process audio (transcribe and summarize)
  const processAudio = async (file: File) => {
    setIsProcessing(true);
    try {
      const result = await uploadAudio(file);
      
      if (result.success && result.transcript) {
        const transcript = result.transcript.trim();
        
        // Log transcript info for debugging
        console.log(`Transcript received: ${transcript.length} characters`);
        
        // Check if transcript is empty or just whitespace
        if (!transcript || transcript.length === 0) {
          toast.error("Empty transcript", {
            description: "The audio recording did not produce any transcript. Please try recording again.",
          });
          setIsProcessing(false);
          setAudioFile(null);
          setRecordingTime(0);
          return;
        }

        // Check if transcript is long enough for analysis
        if (transcript.length < 50) {
          toast.warning("Transcript too short", {
            description: `Transcript is only ${transcript.length} characters. Need at least 50 characters for analysis. Transcript: "${transcript.substring(0, 100)}${transcript.length > 100 ? '...' : ''}"`,
            duration: 8000,
          });
          setIsProcessing(false);
          setAudioFile(null);
          setRecordingTime(0);
          return;
        }

        // Analyze the transcript
        try {
          const analysisResult = await analyze(transcript, "text");
          
          // Store result and navigate
          sessionStorage.setItem("analysisResult", JSON.stringify(analysisResult));
          navigate("/results");
          
          toast.success("Audio processed successfully!", {
            description: "Transcription and analysis complete",
          });
        } catch (analyzeError) {
          console.error("Error analyzing transcript:", analyzeError);
          const errorMessage = analyzeError instanceof Error ? analyzeError.message : "Could not analyze transcript";
          
          // Check if it's a timeout error
          if (errorMessage.includes("504") || errorMessage.includes("timed out") || errorMessage.includes("timeout")) {
            toast.error("Analysis timeout", {
              description: "The analysis is taking too long. The LLM service might be slow or overloaded. Please try again or use a shorter audio recording.",
              duration: 10000,
            });
          } else if (errorMessage.includes("400") || errorMessage.includes("Content must be")) {
            toast.error("Invalid transcript", {
              description: errorMessage,
              duration: 8000,
            });
          } else {
            toast.error("Analysis failed", {
              description: errorMessage,
              duration: 8000,
            });
          }
          throw analyzeError;
        }
      } else {
        throw new Error(result.error || "Failed to process audio - no transcript received");
      }
    } catch (error) {
      console.error("Error processing audio:", error);
      toast.error("Failed to process audio", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsProcessing(false);
      setAudioFile(null);
      setRecordingTime(0);
    }
  };

  // Handle audio file upload
  const handleAudioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith("audio/")) {
        toast.error("Invalid file type", {
          description: "Please select an audio file",
        });
        return;
      }
      setAudioFile(selectedFile);
      await processAudio(selectedFile);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === "application/pdf") {
      setFile(droppedFile);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleAnalyze = async () => {
    // Validate content before analyzing
    const trimmedContent = textContent.trim();
    
    if (!trimmedContent || trimmedContent.length === 0) {
      toast.error("No content to analyze", {
        description: "Please enter some text content before analyzing",
      });
      return;
    }
    
    if (trimmedContent.length < 50) {
      toast.warning("Content too short", {
        description: `Your content is only ${trimmedContent.length} characters. Need at least 50 characters for analysis.`,
      });
      return;
    }
    
    try {
      const result = await analyze(trimmedContent, "text");
      // Store result in sessionStorage and navigate
      sessionStorage.setItem("analysisResult", JSON.stringify(result));
      navigate("/results");
    } catch (err) {
      // Error is already handled by the hook with a toast
      console.error("Analysis failed:", err);
    }
  };

  const canAnalyze = 
    activeMethod === "text" 
      ? textContent.trim().length > 50 
      : activeMethod === "pdf"
      ? file !== null
      : false; // Audio is handled separately

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      <ParticleBackground />
      <Navbar />

      <main className="flex-1 pt-32 pb-20 relative z-10">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header with unique animation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl gradient-hero mb-6 shadow-glow"
            >
              <Brain className="w-10 h-10 text-primary-foreground" />
            </motion.div>
            <h1 className="font-display font-bold text-4xl md:text-5xl text-foreground mb-4">
              Feed Your Content
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our AI will digest your text and create a beautiful, structured knowledge map.
            </p>
          </motion.div>

          {/* Input Method Selector with glow effect */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex justify-center mb-8"
          >
            <div className="inline-flex gap-2 p-2 bg-card dark:bg-card/80 backdrop-blur-sm rounded-2xl border border-border shadow-card">
              {inputMethods.map((method) => (
                <motion.button
                  key={method.id}
                  onClick={() => setActiveMethod(method.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`relative flex items-center gap-3 px-6 py-3 rounded-xl transition-all overflow-hidden ${
                    activeMethod === method.id
                      ? "bg-gradient-to-r from-primary to-primary/80 dark:from-accent dark:to-accent/80 text-primary-foreground dark:text-accent-foreground shadow-lg"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {activeMethod === method.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80 dark:from-accent dark:to-accent/80 -z-10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <method.icon className="w-5 h-5" />
                  <div className="text-left">
                    <div className="font-medium text-sm">{method.label}</div>
                    <div className={`text-xs ${activeMethod === method.id ? "text-primary-foreground/70 dark:text-accent-foreground/70" : "text-muted-foreground"}`}>
                      {method.description}
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Input Area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <AnimatePresence mode="wait">
              {activeMethod === "text" && (
                <motion.div
                  key="text"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="relative group"
                >
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Paste your lecture notes, article, or any text content here... (minimum 50 characters)"
                    className="relative w-full h-80 p-6 bg-card rounded-2xl border border-border shadow-card resize-none focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-foreground placeholder:text-muted-foreground font-body transition-all"
                  />
                  <div className="absolute bottom-4 right-4 flex items-center gap-3">
                    <motion.div
                      animate={{ 
                        color: textContent.length > 50 ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))"
                      }}
                      className="text-sm font-medium"
                    >
                      {textContent.length} / 50+ characters
                    </motion.div>
                    {textContent.length > 50 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-accent"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeMethod === "pdf" && (
                <motion.div
                  key="pdf"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    className={`relative h-80 rounded-2xl border-2 border-dashed transition-all flex items-center justify-center ${
                      isDragging
                        ? "border-accent bg-accent/10 scale-[1.02]"
                        : file
                        ? "border-accent bg-accent/5"
                        : "border-border bg-card hover:border-accent/50 hover:bg-muted/30"
                    }`}
                  >
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />

                    <AnimatePresence mode="wait">
                      {file ? (
                        <motion.div
                          key="file-info"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="text-center"
                        >
                          <motion.div 
                            initial={{ rotate: 0 }}
                            animate={{ rotate: [0, 10, -10, 0] }}
                            transition={{ duration: 0.5 }}
                            className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/20 flex items-center justify-center"
                          >
                            <CheckCircle2 className="w-8 h-8 text-accent" />
                          </motion.div>
                          <p className="font-medium text-foreground mb-1">{file.name}</p>
                          <p className="text-sm text-muted-foreground mb-4">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFile(null);
                            }}
                            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Remove file
                          </button>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="upload-prompt"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="text-center"
                        >
                          <motion.div
                            animate={{ y: isDragging ? -10 : 0, scale: isDragging ? 1.1 : 1 }}
                            className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center"
                          >
                            <UploadIcon className="w-8 h-8 text-muted-foreground" />
                          </motion.div>
                          <p className="font-medium text-foreground mb-1">
                            {isDragging ? "Drop your PDF here" : "Drag & drop your PDF"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            or click to browse files
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {activeMethod === "audio" && (
                <motion.div
                  key="audio"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  {/* Audio Mode Selector */}
                  <div className="flex justify-center gap-2 p-2 bg-card/50 dark:bg-card/30 backdrop-blur-sm rounded-xl border border-border">
                    {audioModes.map((mode) => (
                      <motion.button
                        key={mode.id}
                        onClick={() => {
                          if (isRecording) {
                            stopRecording();
                          }
                          setAudioMode(mode.id);
                          setAudioFile(null);
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                          audioMode === mode.id
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        <mode.icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{mode.label}</span>
                      </motion.button>
                    ))}
                  </div>

                  {/* Audio Content Area */}
                  <div className="relative h-80 rounded-2xl border-2 border-dashed border-border bg-card flex items-center justify-center">
                    {audioMode === "mic" && (
                      <div className="text-center space-y-6 p-8">
                        {!isRecording && !isProcessing ? (
                          <>
                            <motion.div
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="w-24 h-24 mx-auto rounded-full bg-accent/20 flex items-center justify-center"
                            >
                              <Mic className="w-12 h-12 text-accent" />
                            </motion.div>
                            <div>
                              <h3 className="font-semibold text-lg text-foreground mb-2">
                                Record from Microphone
                              </h3>
                              <p className="text-sm text-muted-foreground mb-6">
                                Click the button below to start recording from your computer microphone
                              </p>
                              <Button
                                onClick={startMicRecording}
                                variant="hero"
                                size="lg"
                                className="gap-2"
                              >
                                <Circle className="w-5 h-5 fill-current" />
                                Start Recording
                              </Button>
                            </div>
                          </>
                        ) : isRecording ? (
                          <>
                            <motion.div
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 1, repeat: Infinity }}
                              className="w-24 h-24 mx-auto rounded-full bg-destructive/20 flex items-center justify-center"
                            >
                              <motion.div
                                animate={{ scale: [1, 1.3, 1] }}
                                transition={{ duration: 0.5, repeat: Infinity }}
                                className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center"
                              >
                                <Square className="w-8 h-8 text-destructive-foreground fill-current" />
                              </motion.div>
                            </motion.div>
                            <div>
                              <h3 className="font-semibold text-lg text-foreground mb-2">
                                Recording...
                              </h3>
                              <p className="text-4xl font-mono font-bold text-accent mb-6">
                                {formatTime(recordingTime)}
                              </p>
                              <Button
                                onClick={stopRecording}
                                variant="destructive"
                                size="lg"
                                className="gap-2"
                              >
                                <Square className="w-5 h-5 fill-current" />
                                Stop Recording
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-4">
                            <Loader2 className="w-12 h-12 mx-auto text-accent animate-spin" />
                            <p className="text-muted-foreground">Processing audio...</p>
                          </div>
                        )}
                      </div>
                    )}

                    {audioMode === "upload" && (
                      <div className="text-center space-y-6 p-8 w-full">
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={handleAudioFileSelect}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          disabled={isProcessing}
                        />
                        {!isProcessing ? (
                          <>
                            <motion.div
                              animate={{ y: isDragging ? -10 : 0, scale: isDragging ? 1.1 : 1 }}
                              className="w-24 h-24 mx-auto rounded-2xl bg-muted flex items-center justify-center"
                            >
                              <UploadCloud className="w-12 h-12 text-muted-foreground" />
                            </motion.div>
                            <div>
                              <h3 className="font-semibold text-lg text-foreground mb-2">
                                Upload Audio File
                              </h3>
                              <p className="text-sm text-muted-foreground mb-2">
                                {audioFile ? audioFile.name : "Click here or drag & drop to upload"}
                              </p>
                              {audioFile && (
                                <p className="text-xs text-muted-foreground mb-4">
                                  {(audioFile.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="space-y-4">
                            <Loader2 className="w-12 h-12 mx-auto text-accent animate-spin" />
                            <p className="text-muted-foreground">Processing audio...</p>
                          </div>
                        )}
                      </div>
                    )}

                    {audioMode === "system" && (
                      <div className="text-center space-y-6 p-8">
                        {!isRecording && !isProcessing ? (
                          <>
                            <motion.div
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="w-24 h-24 mx-auto rounded-full bg-accent/20 flex items-center justify-center"
                            >
                              <Radio className="w-12 h-12 text-accent" />
                            </motion.div>
                            <div>
                              <h3 className="font-semibold text-lg text-foreground mb-2">
                                Record System Audio
                              </h3>
                              <p className="text-sm text-muted-foreground mb-2 max-w-md mx-auto">
                                Record audio from your system (meetings, video calls, etc.). 
                                When you click start, select the audio source in the browser prompt.
                              </p>
                              <p className="text-xs text-muted-foreground/70 mb-6 max-w-md mx-auto">
                                Note: System audio recording works best in Chrome or Edge. Some browsers may not support this feature.
                              </p>
                              <Button
                                onClick={startSystemRecording}
                                variant="hero"
                                size="lg"
                                className="gap-2"
                              >
                                <Circle className="w-5 h-5 fill-current" />
                                Start System Recording
                              </Button>
                            </div>
                          </>
                        ) : isRecording ? (
                          <>
                            <motion.div
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 1, repeat: Infinity }}
                              className="w-24 h-24 mx-auto rounded-full bg-destructive/20 flex items-center justify-center"
                            >
                              <motion.div
                                animate={{ scale: [1, 1.3, 1] }}
                                transition={{ duration: 0.5, repeat: Infinity }}
                                className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center"
                              >
                                <Radio className="w-8 h-8 text-destructive-foreground" />
                              </motion.div>
                            </motion.div>
                            <div>
                              <h3 className="font-semibold text-lg text-foreground mb-2">
                                Recording System Audio...
                              </h3>
                              <p className="text-4xl font-mono font-bold text-accent mb-6">
                                {formatTime(recordingTime)}
                              </p>
                              <p className="text-sm text-muted-foreground mb-4">
                                Recording all audio from your system
                              </p>
                              <Button
                                onClick={stopRecording}
                                variant="destructive"
                                size="lg"
                                className="gap-2"
                              >
                                <Square className="w-5 h-5 fill-current" />
                                Stop Recording
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-4">
                            <Loader2 className="w-12 h-12 mx-auto text-accent animate-spin" />
                            <p className="text-muted-foreground">Processing audio...</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Analyze Button with magic effect */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <div className="relative inline-block">
              {canAnalyze && !isAnalyzing && (
                <motion.div
                  className="absolute -inset-1 bg-gradient-to-r from-accent via-primary to-accent rounded-xl blur-md opacity-50"
                  animate={{ 
                    opacity: [0.3, 0.6, 0.3],
                    scale: [1, 1.02, 1],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
              <Button
                variant="hero"
                size="xl"
                onClick={handleAnalyze}
                disabled={!canAnalyze || isAnalyzing}
                className="relative group min-w-64"
              >
                {isAnalyzing ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 className="w-5 h-5" />
                    </motion.div>
                    <span className="ml-2">Analyzing with AI...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    Generate Learning Map
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </Button>
            </div>

            {!canAnalyze && activeMethod !== "audio" && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 text-sm text-muted-foreground"
              >
                {activeMethod === "text"
                  ? "Please enter at least 50 characters to analyze"
                  : "Please upload a PDF file to analyze"}
              </motion.p>
            )}
          </motion.div>

          {/* Tips with hover effects */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-16 grid md:grid-cols-3 gap-6"
          >
            {[
              { icon: Sparkles, title: "AI-Powered", tip: "Advanced NLP extracts key concepts" },
              { icon: Brain, title: "Deep Analysis", tip: "Discovers hidden topic relationships" },
              { icon: CheckCircle2, title: "Privacy First", tip: "Your data is processed securely" },
            ].map((item, i) => (
              <motion.div 
                key={i} 
                whileHover={{ y: -4, scale: 1.02 }}
                className="text-center p-6 bg-card/50 dark:bg-card/30 backdrop-blur-sm rounded-xl border border-border/50 hover:border-accent/30 transition-colors cursor-default"
              >
                <item.icon className="w-8 h-8 mx-auto mb-3 text-accent" />
                <h4 className="font-display font-semibold text-foreground mb-2">{item.title}</h4>
                <p className="text-sm text-muted-foreground">{item.tip}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default UploadPage;
