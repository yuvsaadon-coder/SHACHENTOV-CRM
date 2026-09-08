# Shachentov CRM — Executive Summary

> Source: [Claude Artifact](https://claude.ai/code/artifact/7a44fa01-af48-4ba8-b557-b49910b400f3)  
> Source version: September 2026  
> Repository ingestion date: September 6, 2026  
> Source classification: Confidential  
> Hebrew source capture: [executive-summary.he.md](executive-summary.he.md)  
> Note: This document preserves the source requirements. Claims about implementation status do not constitute verification of the actual code.

## System Purpose

Shachentov CRM is a cloud-based organizational management system that replaces spreadsheets and fragmented communication with one organized workspace. The system is intended to let headquarters staff plan and track work across eight departments, manage branch coordinators in Jerusalem, track quarterly reports, and access an AI assistant—all in one place and in real time.

## Target Audiences

### Headquarters Staff and Management

Staff working in finance, suppliers, design, publications, volunteers, coordinators, donations, and the CEO. Users manage tasks, track progress, maintain contacts and staffing, oversee branches, and produce reports. Administrators also receive access to settings and configuration tools.

### Branch Coordinators

Field coordinators who manage food branches and youth-cafe locations across Jerusalem. They use a separate, simplified portal to:

- Submit quarterly reports.
- Access guides and procedures.
- Chat with an AI assistant focused on their branch.

## Organizational Domains

Every task, contact, and knowledge item is tagged with a domain. Domain managers see their own domain by default; administrators see all information.

1. CEO.
2. Jerusalem.
3. Suppliers.
4. Finance.
5. Donations.
6. Designs.
7. Publications.
8. Volunteers.

## Core Capabilities

### Task Management

Create and track organizational tasks with owners, deadlines, and status. Tasks are displayed as a list, Kanban board, calendar, or Gantt chart. Users can attach files, add comments, and view a complete change log.

### Automatic Recurrence

Recurring tasks—monthly, quarterly, semiannual, annual, or holiday-dependent—automatically reset to "Not completed" at the beginning of each new cycle without manual intervention.

### Organizational Role Staffing

Track every role in the organization: who holds it, whether it is staffed or at risk, the delegation chain, recruitment urgency, and the tasks associated with it.

### Organizational Chart

A visual hierarchy of the organization. Each branch appears as a node with coordinator details, volunteer count, and an operational schedule.

### Branch Operations

A directory of food and youth-cafe branches, including distribution schedules, basket quantities, packing times, addresses, and linked coordinators.

### Quarterly Reports

Branch coordinators submit structured reports through the portal. Headquarters receives a coverage dashboard showing who has and has not reported, by quarter and year.

### Knowledge Library

Knowledge management has two layers:

- A local workspace for each coordinator and their guides.
- An organizational headquarters library containing procedures, handover files, tips, and research.

Information can be searched and filtered by domain, category, and tags.

### AI Assistant

An embedded chat powered by Claude AI. Headquarters staff can ask questions about tasks, the knowledge base, branch reports, and research. Coordinators have a separate assistant focused on their branch.

### Personal Tasks

Each staff member has a private to-do list that is not visible to other users and does not appear in organizational views.

### Contacts

An organizational address book for headquarters staff, suppliers, and donors. Contacts can be linked to tasks and filtered by type and department.

## Primary Information Flow

1. A branch coordinator signs in to the portal using their phone number, without an email address. The system identifies the branch to which the coordinator is assigned.
2. The coordinator submits a quarterly report. Form questions are configured by an administrator and may change from one quarter to another.
3. Headquarters sees the coverage rate in real time—who has reported and who has not—by quarter and year.
4. The headquarters AI assistant can answer data-based questions, such as which branches have not reported or what the volunteer challenges are in a particular quarter.

## Real-Time Requirement

Every change—a task status update, a report submission, or a contact edit—should appear immediately to other users without requiring a manual refresh.

## Technology Described in the Source

| Layer | Technology |
|---|---|
| Hosting and CDN | Netlify |
| Database | Google Firebase / Cloud Firestore |
| Authentication | Firebase Auth |
| File storage | Firebase Storage |
| AI | Anthropic Claude through the server side |
| User interface | React 19, TypeScript, Tailwind CSS |
| Backend logic | Netlify Serverless Functions |
| Hebrew calendar | `@hebcal/core` |
