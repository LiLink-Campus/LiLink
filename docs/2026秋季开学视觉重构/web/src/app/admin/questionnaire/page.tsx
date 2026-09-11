import {
  fetchAdminApiServer,
  hasAdminSessionCookie,
} from "../../../lib/server-api";
import AdminQuestionnairePage from "./admin-questionnaire-client";
import type { AdminQuestion } from "../types";

type QuestionnairePayload = {
  id: string;
  title: string;
  description: string | null;
  questions: AdminQuestion[];
};

async function getInitialQuestions() {
  if (!(await hasAdminSessionCookie())) {
    return [];
  }

  try {
    const payload = await fetchAdminApiServer<QuestionnairePayload>(
      "/admin/questionnaire",
    );
    return payload.questions ?? [];
  } catch {
    return [];
  }
}

export default async function AdminQuestionnaireServerPage() {
  const initialQuestions = await getInitialQuestions();
  return <AdminQuestionnairePage initialQuestions={initialQuestions} />;
}
