import { ChoiceClient } from "./choice-client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export const metadata = {
  title: "בחירת המשך טיפול",
  description: "מטפל/ת שלך עוזב/ת את הקליניקה. כאן ניתן לבחור איך להמשיך.",
  robots: { index: false, follow: false },
};

export default async function DepartureChoicePage({ params }: Props) {
  const { token } = await params;
  return <ChoiceClient token={token} />;
}
