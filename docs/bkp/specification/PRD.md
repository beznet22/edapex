# EdApex Master Product Requirements Document (PRD)

## 1. Vision & Objectives
EdApex is a planet-scale, AI-native school operating system. It aims to eliminate administrative burdens by automating 100% of routine educational operations via a Hierarchical Multi-Agent System (HMAS).

---

## 2. Core Functional Domains (Exhaustive)

### A. Student & Guardian Management
*   **Requirements**: Full lifecycle from admission (prospect) to alumni.
*   **Entities**: `profiles.student`, `profiles.guardian`, `profiles.sibling`, `profiles.student_category`.
*   **Fidelity**: Must support InfixEdu-style sibling linking, ID card generation, and student promotion workflows.
*   **Business Logic**: Admission Agent auto-validates entry documents and suggests classroom placement based on `student_category`.

### B. Adaptive Academic Management
*   **Hierarchy**: Academic Year ➜ Term ➜ Class ➜ Section ➜ Subject.
*   **Components**: Classrooms, Class Teachers, Class Routines (Timetables), Lesson Plans, Topics, Syllabus, and Study Materials.
*   **AI Integration**: Academic Coordinator auto-resolves timetable conflicts and suggests syllabus adjustments based on real-time classroom progress.

### C. Unified Learning & Assessment
*   **Exams**: Exam Types, Exam Setup, Exam Schedule, Mark Register.
*   **Online Exams**: LaTeX support, MCQ/True-False/Fill-in-the-blank, auto-shuffling, and Auto-grading via Question Bank.
*   **Grading**: Custom grade scales, merit list generation, and automated result processing.
*   **Attendance**: Student Attendance, Staff Attendance, Subject-wise tracking (Manual/QR/AI-Vision).
*   **AI Integration**: Assessment Agent auto-grades exams and provides personalized learning gap analysis for every student.

### D. Precision Financial Engine
*   **Fees**: Fees Group, Fees Type, Fees Master, Fees Discount, Fine Management.
*   **Accounting**: Income/Expense tracking, Profit/Loss, Bank/Cash Accounts, and precision Double-entry reconciliation.
*   **AI Integration**: Finance Agent predicts fee default risk and auto-suggests collection strategies via the Wallet System.

### E. Human Resources & Payroll
*   **Components**: Staff Record, Departments, Designations, Leave Requests, and Payroll Processing.
*   **Fidelity**: Must handle deduction logic, allowance calculation, and payslip generation linked to `staff_attendance`.
*   **AI Integration**: HR Agent monitors staff workload and flagging "Teacher Burnout" risk.

### F. Logistics: Library, Transport, & Dormitory
*   **Library**: `assets.book`, `assets.book_category`, Members, Issued Books, Returns.
*   **Transport**: `academics.transport_route`, `assets.vehicle`, Assignments, Transport Reports.
*   **Dormitory**: `academics.dormitory`, `academics.dorm_room`, `profiles.dorm_allocation`.
*   **AI Integration**: Logistics Agents optimize vehicle routes and dorm allocations for maximum efficiency.

---

## 3. High-Tier AI Innovations
The PRD mandates the following "Beyond the Horizon" features as core platform requirements:

1.  **Emotional & Cognitive State Analysis**: Detect student fatigue/stress from interaction patterns and modify lesson delivery.
2.  **Synthetic Peer Persona**: AI roleplay for immersive academic debate and social skill training.
3.  **Federated Pedagogy Intelligence**: Share "Top-Performing" teaching strategies across all schools anonymously for global improvement.
4.  **Autonomic Sustainability**: Link ERP routine to Smart Building IoT to automate energy savings based on real-time occupancy.
5.  **Skill-Based Micro-Credentialing**: Auto-issue verified skill badges based on artifact audits (submissions/projects) rather than just exams.

---

## 4. Deep Logic: Innovations & Autonomic Features
The system implements advanced autonomic logic to transition from "Record Keeping" to "Actionable Intelligence."

### A. Emotional & Cognitive State Engine
*   **Logic**: The system monitors `activity_logs` for specific LMS interaction indicators:
    *   **Latency**: Time taken to start/finish a learning module vs. peer average.
    *   **Interaction Depth**: Re-reading of specific sections, click-intensity, and session duration.
*   **Outcome**: If "Fatigue" is detected (Latency > 200% average), the system triggers an "Intervention Task" for the local agent to pause the module or offer a simplified explanation.

### B. Federated Pedagogy Logic
*   **Logic**:
    1.  **Metric Extraction**: Academic agents calculate "Section Success Rate" (e.g., % of students passing Algebra Term 1).
    2.  **Gradient Masking**: Local nodes extract the *teaching pattern* (order of topics, homework frequency) without student data.
    3.  **Aggregation**: The Global Coordinator Merges patterns from top 5% performing schools.
*   **Outcome**: Suggestions for pedagogical improvement (e.g., "Schools with high retention start Algebra with Geometry basics") are distributed to all teachers.

### C. Autonomic Sustainability Sync
*   **Logic**:
    1.  **Schedule Monitor**: Scans `domain.academics` for active `class_routines`.
    2.  **Occupancy Trigger**: Links to `activity_logs` real-time attendance signals.
    3.  **IoT Bridge**: If 0 students are marked present in Room A during its scheduled slot, a low-latency event is sent to the building's IoT gateway to set HVAC to "Eco Mode."

### D. Skill-Based Micro-Credentialing
*   **Logic**:
    1.  **Artifact Audit**: The AI scans `homework_submissions` in `domain.activity_logs`.
    2.  **Skill Mapping**: Cross-references content against a "Global Skill Tree" (e.g., Critical Thinking, Python Data Frames).
    3.  **Verification**: If 3+ artifacts demonstrate the skill, a verified badge is added to the `profiles.data` JSONB for that student.

---

## 5. Non-Functional Hard Constraints
*   **Performance**: <100ms API response time with forced RLS isolation.
*   **Availability**: 99.99% multi-region uptime.
*   **Client**: One codebase for Web/Desktop/Mobile (Next.js + Tauri).
*   **Scale**: Partitioned schema to handle 10M+ student daily activity logs.
