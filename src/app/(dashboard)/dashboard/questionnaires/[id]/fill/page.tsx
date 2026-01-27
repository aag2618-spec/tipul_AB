"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  Brain,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Question {
  id: number;
  title: string;
  description?: string;
  section?: string;
  sectionName?: string;
  options?: { value: number; text: string }[];
  isCritical?: boolean;
  fields?: { name: string; type: string; label: string; options?: string[] }[];
  phase?: string;
  instruction?: string;
}

interface Template {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  category: string | null;
  testType: string;
  questions: Question[];
  scoring: any;
}

interface Response {
  id: string;
  answers: any[];
  totalScore: number | null;
  subscores: any;
  status: string;
  template: Template;
  client: {
    id: string;
    name: string;
    birthDate: string | null;
  };
}

export default function FillQuestionnairePage() {
  const router = useRouter();
  const params = useParams();
  const responseId = params.id as string;

  const [response, setResponse] = useState<Response | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showCriticalAlert, setShowCriticalAlert] = useState(false);
  const [criticalMessage, setCriticalMessage] = useState("");

  useEffect(() => {
    fetchResponse();
  }, [responseId]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!response || Object.keys(answers).length === 0) return;
    
    const interval = setInterval(() => {
      saveProgress(false); // Silent save
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [answers, response]);

  // Confirm before leaving if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(answers).length > 0 && response?.status !== "COMPLETED") {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [answers, response]);

  // Keyboard navigation
  useEffect(() => {
    if (!response) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const questions = response.template.questions;
      const currentQuestion = questions[currentIndex];
      
      switch(e.key) {
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
          }
          break;
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          if (currentIndex < questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
          }
          break;
        case " ": // Space bar - select/deselect radio
          if (currentQuestion?.options && currentQuestion.options.length > 0) {
            e.preventDefault();
            // Toggle between options or select first if none selected
            const currentValue = answers[currentIndex]?.value;
            const currentOptionIndex = currentQuestion.options.findIndex(o => o.value === currentValue);
            const nextIndex = currentOptionIndex + 1 < currentQuestion.options.length ? currentOptionIndex + 1 : 0;
            const nextOption = currentQuestion.options[nextIndex];
            handleAnswer(currentIndex, { value: nextOption.value, text: nextOption.text });
          }
          break;
        case "s":
        case "S":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            saveProgress();
          }
          break;
      }
    };

    if (!loading) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [currentIndex, answers, loading, response]);

  const fetchResponse = async () => {
    try {
      const res = await fetch(`/api/questionnaires/responses/${responseId}`);
      if (res.ok) {
        const data = await res.json();
        setResponse(data);
        
        // Load existing answers
        if (data.answers && Array.isArray(data.answers)) {
          const answersMap: Record<number, any> = {};
          data.answers.forEach((a: any, i: number) => {
            answersMap[i] = a;
          });
          setAnswers(answersMap);
        }
      } else {
        toast.error("שאלון לא נמצא");
        router.push("/dashboard/questionnaires");
      }
    } catch (error) {
      console.error("Error fetching response:", error);
      toast.error("שגיאה בטעינת השאלון");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (questionIndex: number, value: any) => {
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: value
    }));

    // Check for critical items
    const question = response?.template.questions[questionIndex];
    if (question?.isCritical && value?.value >= 2) {
      setCriticalMessage(`שים לב: תשובה קריטית בשאלה "${question.title}". יש לבדוק עם המטופל.`);
      setShowCriticalAlert(true);
    }
  };

  const saveProgress = async (showToast = true) => {
    if (!response) return;
    
    setSaving(true);
    try {
      const answersArray = Object.values(answers);
      const res = await fetch(`/api/questionnaires/responses/${responseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answersArray }),
      });

      if (res.ok && showToast) {
        toast.success("ההתקדמות נשמרה");
      }
    } catch (error) {
      if (showToast) {
        toast.error("שגיאה בשמירה");
      }
    } finally {
      setSaving(false);
    }
  };

  const calculateScore = () => {
    if (!response) return { total: 0, subscores: {} };
    
    const questions = response.template.questions;
    let total = 0;
    const subscores: Record<string, number> = {};

    Object.entries(answers).forEach(([index, answer]) => {
      const question = questions[parseInt(index)];
      if (answer?.value !== undefined) {
        total += answer.value;
        
        if (question?.section) {
          subscores[question.section] = (subscores[question.section] || 0) + answer.value;
        }
      }
    });

    return { total, subscores };
  };

  const completeQuestionnaire = async () => {
    if (!response) return;
    
    setSaving(true);
    try {
      const { total, subscores } = calculateScore();
      const answersArray = Object.values(answers);
      
      const res = await fetch(`/api/questionnaires/responses/${responseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: answersArray,
          totalScore: total,
          subscores,
          status: "COMPLETED",
        }),
      });

      if (res.ok) {
        toast.success("השאלון הושלם בהצלחה!");
        router.push(`/dashboard/questionnaires/${responseId}`);
      }
    } catch (error) {
      toast.error("שגיאה בשמירה");
    } finally {
      setSaving(false);
      setShowCompleteDialog(false);
    }
  };

  if (loading || !response) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const questions = response.template.questions;
  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / questions.length) * 100; // Fixed: based on answered questions
  const isStandardQuestionnaire = response.template.testType === "SELF_REPORT" || 
                                   response.template.testType === "CLINICIAN_RATED";

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{response.template.name}</h1>
              <p className="text-sm text-muted-foreground">
                {response.client.name}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => saveProgress()} disabled={saving}>
            <Save className="h-4 w-4 ml-2" />
            שמור
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>שאלה {currentIndex + 1} מתוך {questions.length}</span>
            <span className="font-medium">{answeredCount}/{questions.length} נענו ({Math.round(progress)}%)</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>קיצורי מקלדת: חיצים לניווט | רווח לבחירה | Ctrl+S לשמירה</span>
            <span>שמירה אוטומטית: כל 30 שניות</span>
          </div>
        </div>
      </div>

      {/* Question Card */}
      <Card className="mb-6">
        <CardHeader>
          {currentQuestion.section && (
            <Badge variant="outline" className="w-fit mb-2">
              {currentQuestion.sectionName || currentQuestion.section}
            </Badge>
          )}
          <CardTitle className="text-lg">
            {currentQuestion.id}. {currentQuestion.title}
          </CardTitle>
          {currentQuestion.description && (
            <CardDescription>{currentQuestion.description}</CardDescription>
          )}
          {currentQuestion.instruction && (
            <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm">
              <strong>הנחיות:</strong> {currentQuestion.instruction}
            </div>
          )}
          {currentQuestion.isCritical && (
            <div className="flex items-center gap-2 mt-2 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">שאלה קריטית</span>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {/* Standard multiple choice */}
          {currentQuestion.options && currentQuestion.options.length > 0 && (
            <RadioGroup
              value={answers[currentIndex]?.value?.toString()}
              onValueChange={(value: string) => {
                const numValue = parseInt(value);
                const option = currentQuestion.options?.find(o => o.value === numValue);
                handleAnswer(currentIndex, { 
                  value: numValue, 
                  text: option?.text 
                });
              }}
              className="space-y-3"
            >
              {currentQuestion.options.map((option) => (
                <div 
                  key={option.value}
                  className={`flex items-center space-x-3 space-x-reverse p-3 rounded-lg border transition-colors ${
                    answers[currentIndex]?.value === option.value 
                      ? "border-primary bg-primary/5" 
                      : "hover:bg-muted"
                  }`}
                >
                  <RadioGroupItem value={option.value.toString()} id={`option-${option.value}`} />
                  <Label 
                    htmlFor={`option-${option.value}`} 
                    className="flex-1 cursor-pointer"
                  >
                    <span className="font-medium ml-2">{option.value}</span>
                    {option.text}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {/* Dynamic fields for projective/intelligence/diagnostic tests */}
          {currentQuestion.fields && (
            <div className="space-y-4">
              {currentQuestion.fields.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label>{field.label}</Label>
                  
                  {field.type === "textarea" && (
                    <Textarea
                      value={answers[currentIndex]?.[field.name] || ""}
                      onChange={(e) => handleAnswer(currentIndex, {
                        ...answers[currentIndex],
                        [field.name]: e.target.value
                      })}
                      rows={4}
                      placeholder={`הכנס ${field.label.toLowerCase()}...`}
                    />
                  )}
                  
                  {field.type === "text" && (
                    <Input
                      value={answers[currentIndex]?.[field.name] || ""}
                      onChange={(e) => handleAnswer(currentIndex, {
                        ...answers[currentIndex],
                        [field.name]: e.target.value
                      })}
                      placeholder={`הכנס ${field.label.toLowerCase()}...`}
                    />
                  )}
                  
                  {field.type === "number" && (
                    <Input
                      type="number"
                      value={answers[currentIndex]?.[field.name] || ""}
                      onChange={(e) => handleAnswer(currentIndex, {
                        ...answers[currentIndex],
                        [field.name]: parseFloat(e.target.value)
                      })}
                      placeholder="0"
                    />
                  )}
                  
                  {field.type === "date" && (
                    <Input
                      type="date"
                      value={answers[currentIndex]?.[field.name] || ""}
                      onChange={(e) => handleAnswer(currentIndex, {
                        ...answers[currentIndex],
                        [field.name]: e.target.value
                      })}
                    />
                  )}
                  
                  {field.type === "select" && field.options && (
                    <select
                      className="w-full p-2 border rounded-lg"
                      value={answers[currentIndex]?.[field.name] || ""}
                      onChange={(e) => handleAnswer(currentIndex, {
                        ...answers[currentIndex],
                        [field.name]: e.target.value
                      })}
                    >
                      <option value="">בחר...</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                  
                  {field.type === "table" && field.options && (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            {(field.options as any).headers?.map((header: string, i: number) => (
                              <th key={i} className="p-2 text-right text-sm font-medium">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(field.options as any).rows?.map((row: any, rowIndex: number) => (
                            <tr key={rowIndex} className="border-t">
                              {row.map((cell: any, cellIndex: number) => (
                                <td key={cellIndex} className="p-2">
                                  {cell.type === "input" ? (
                                    <Input
                                      value={answers[currentIndex]?.[field.name]?.[rowIndex]?.[cellIndex] || ""}
                                      onChange={(e) => {
                                        const newTableData = answers[currentIndex]?.[field.name] || [];
                                        newTableData[rowIndex] = newTableData[rowIndex] || [];
                                        newTableData[rowIndex][cellIndex] = e.target.value;
                                        handleAnswer(currentIndex, {
                                          ...answers[currentIndex],
                                          [field.name]: newTableData
                                        });
                                      }}
                                      className="w-full"
                                      placeholder={cell.placeholder || ""}
                                    />
                                  ) : (
                                    <span className="text-sm">{cell.text || cell}</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Free text answer - for open-ended questions */}
          {(!currentQuestion.options || currentQuestion.options.length === 0) && !currentQuestion.fields && (
            <div className="space-y-2">
              <Label>תשובה חופשית</Label>
              <Textarea
                value={answers[currentIndex]?.text || ""}
                onChange={(e) => handleAnswer(currentIndex, {
                  ...answers[currentIndex],
                  text: e.target.value
                })}
                rows={6}
                placeholder="כתוב את תשובתך כאן..."
              />
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
          >
            <ChevronRight className="h-4 w-4 ml-2" />
            הקודם
          </Button>

          {currentIndex < questions.length - 1 ? (
            <Button
              onClick={() => setCurrentIndex(currentIndex + 1)}
            >
              הבא
              <ChevronLeft className="h-4 w-4 mr-2" />
            </Button>
          ) : (
            <Button
              onClick={() => setShowCompleteDialog(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 ml-2" />
              סיים שאלון
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Question navigator */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">מעבר מהיר</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="flex flex-wrap gap-2">
            {questions.map((q, index) => (
              <Button
                key={index}
                variant={currentIndex === index ? "default" : answers[index] ? "secondary" : "outline"}
                size="sm"
                className="w-8 h-8 p-0"
                onClick={() => setCurrentIndex(index)}
              >
                {index + 1}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Complete Dialog with Summary */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>סיכום וסיום השאלון</AlertDialogTitle>
            <AlertDialogDescription>
              סקור את התשובות שלך לפני סיום:
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-3 my-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">סטטיסטיקה</span>
                <Badge variant={answeredCount === questions.length ? "default" : "secondary"}>
                  {answeredCount}/{questions.length} נענו
                </Badge>
              </div>
              {answeredCount < questions.length && (
                <p className="text-sm text-orange-600">
                  שים לב: {questions.length - answeredCount} שאלות לא נענו
                </p>
              )}
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              <p className="text-sm font-medium">שאלות שלא נענו:</p>
              {questions.map((q, idx) => !answers[idx] && (
                <div key={idx} className="p-2 bg-amber-50 rounded text-sm border border-amber-200">
                  שאלה {idx + 1}: {q.title.substring(0, 60)}...
                </div>
              )).filter(Boolean).slice(0, 10)}
              {questions.filter((_, idx) => !answers[idx]).length > 10 && (
                <p className="text-xs text-muted-foreground">
                  ו-{questions.filter((_, idx) => !answers[idx]).length - 10} נוספות...
                </p>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>חזור לשאלון</AlertDialogCancel>
            <AlertDialogAction onClick={completeQuestionnaire} disabled={saving}>
              {saving ? "שומר..." : "סיים ושמור"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Critical Alert */}
      <AlertDialog open={showCriticalAlert} onOpenChange={setShowCriticalAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              התראה קריטית
            </AlertDialogTitle>
            <AlertDialogDescription>
              {criticalMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowCriticalAlert(false)}>
              הבנתי
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
