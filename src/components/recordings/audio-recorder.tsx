"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Square, Pause, Play, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  isUploading?: boolean;
}

export function AudioRecorder({ onRecordingComplete, isUploading }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getSupportedMimeType = () => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "audio/webm";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("לא ניתן לגשת למיקרופון. אנא אשר הרשאות.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, []);

  const handleUpload = () => {
    if (audioBlob) {
      onRecordingComplete(audioBlob, duration);
    }
  };

  const resetRecording = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setDuration(0);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audioUrl]);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-6">
          {/* Recording indicator */}
          <div
            className={cn(
              "w-32 h-32 rounded-full flex items-center justify-center transition-all",
              isRecording && !isPaused
                ? "bg-primary/20 animate-pulse"
                : audioBlob
                ? "bg-green-100"
                : "bg-muted"
            )}
          >
            {isRecording && !isPaused ? (
              <div className="recording-indicator">
                <Mic className="h-12 w-12 text-primary" />
              </div>
            ) : audioBlob ? (
              <div className="text-green-600">
                <Mic className="h-12 w-12" />
              </div>
            ) : (
              <Mic className="h-12 w-12 text-muted-foreground" />
            )}
          </div>

          {/* Duration */}
          <div className="text-4xl font-mono font-bold tabular-nums">
            {formatDuration(duration)}
          </div>

          {/* Status text */}
          <p className="text-sm text-muted-foreground">
            {isRecording && !isPaused && "מקליט..."}
            {isRecording && isPaused && "מושהה"}
            {!isRecording && audioBlob && "הקלטה מוכנה"}
            {!isRecording && !audioBlob && "לחץ להתחלת הקלטה"}
          </p>

          {/* Audio preview */}
          {audioUrl && !isRecording && (
            <audio src={audioUrl} controls className="w-full" />
          )}

          {/* Controls */}
          <div className="flex items-center gap-3">
            {!isRecording && !audioBlob && (
              <Button onClick={startRecording} size="lg" className="gap-2">
                <Mic className="h-5 w-5" />
                התחל הקלטה
              </Button>
            )}

            {isRecording && (
              <>
                {isPaused ? (
                  <Button onClick={resumeRecording} variant="outline" size="lg">
                    <Play className="h-5 w-5" />
                  </Button>
                ) : (
                  <Button onClick={pauseRecording} variant="outline" size="lg">
                    <Pause className="h-5 w-5" />
                  </Button>
                )}
                <Button onClick={stopRecording} variant="destructive" size="lg">
                  <Square className="h-5 w-5" />
                </Button>
              </>
            )}

            {!isRecording && audioBlob && (
              <>
                <Button onClick={resetRecording} variant="outline" size="lg">
                  הקלט מחדש
                </Button>
                <Button onClick={handleUpload} size="lg" disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                      מעלה...
                    </>
                  ) : (
                    <>
                      <Upload className="ml-2 h-5 w-5" />
                      העלה ותמלל
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}













