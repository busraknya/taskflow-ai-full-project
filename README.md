# TaskFlow AI

TaskFlow AI is a project and task management application in development. It is designed to help small and medium-sized teams organize projects, assign work, follow progress, and keep their task information in one shared place.

The project brings together a web application, an Android app, a backend, and an experimental machine-learning service.

## What are we building?

With TaskFlow, a team should be able to:

- Create a shared workspace and manage team members.
- Organize work into projects and tasks.
- Assign tasks and set priorities and due dates.
- Follow the same work information on web and Android.
- Make supported changes offline on Android and sync them when the connection returns.
- Explore task-delay risk insights when enough reliable data is available.

TaskFlow is still under active development. The list above describes the intended product experience; it does not mean every flow is production-ready.

## How is it structured?

| Part | Responsibility |
|---|---|
| Web app | Manage projects and tasks in a browser |
| Android app | Follow and update tasks on a phone, including supported offline actions |
| Backend | Apply the main application rules and handle requests |
| Database | Store accounts, workspaces, projects, tasks, and related data |
| Background jobs | Handle work such as notifications and email |
| ML service | Experiment with task-delay risk assessment |

**Main technologies:** Next.js and TypeScript for the web app; NestJS and Prisma for the backend; PostgreSQL and Redis for data and background jobs; Kotlin and Jetpack Compose for Android; FastAPI and scikit-learn for the experimental ML service.

## Machine-learning approach

The goal is to explore whether task information—such as time remaining until a due date and the assignee's workload—can help identify tasks that may be delayed.

This feature is experimental. The current sample data is not enough to demonstrate real-world prediction quality, so TaskFlow does not claim to provide verified delay probabilities.

## Project documentation

- [Product overview and roadmap](analysis/product_overview_and_roadmap.md) — the product, its main user journey, and development priorities in plain language.
- [Detailed workflows and requirements](analysis/product_workflows_requirements.md) — detailed requirements, acceptance scenarios, technical findings, and testing notes.

## Development status

TaskFlow is being developed step by step. We distinguish between code that exists, behavior that has been tested, and features that are ready for real users. See the detailed requirements document for current findings and open work.

---
