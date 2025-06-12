# Reddit Opportunity Engine: Onboarding Flow PRD

## Overview
This document outlines the design and implementation plan for a magical, engaging onboarding experience for the Reddit Opportunity Engine. The flow will guide users through providing information about their product, problem area, and target audience, then present them with relevant subreddit recommendations in an engaging way.

## User Experience Goals
- Create a conversational, guided experience that feels personal
- Maintain user engagement during search/loading periods
- Present results in a visually appealing, interactive format
- Make the entire process feel "magical" while being practical to implement
- Include safeguards for input validation

## Technical Requirements
- React-based frontend 
- Integration with existing Reddit Discovery API
- Responsive design (mobile and desktop)
- Reasonable load times and performance

## Tech Stack & Libraries

### Core Technologies
- React.js for component architecture
- Next.js for routing and API routes
- Tailwind CSS for styling

### Animation Libraries
- **Framer Motion** (primary animation library)
  - For page transitions, card animations, and micro-interactions
  - Benefits: Excellent performance, declarative API, production-ready
  
- **Lottie** (for complex loading animations)
  - Pre-built animations from sources like LottieFiles.com
  - Specific animations needed:
    - Exploration/searching animation
    - Data processing animation
    - Celebration animation for results

### Optional Enhancements
- **react-spring** (alternative to Framer Motion for physics-based animations)
- **AutoAnimate** (for simpler list animations)

### Input Validation
- Use OpenAI's API for basic input validation/safeguarding
- Lightweight implementation to prevent inappropriate inputs
- Fallback validation rules for when AI validation is unavailable

## Flow Structure

### 1. Welcome Screen
- **Purpose**: Introduce the purpose of the tool
- **Components**:
  - Welcome message with brief explanation
  - Subtle background animation (gradient movement)
  - "Start Discovery" button with hover effect
- **Animations**: 
  - Fade-in entrance animation
  - Button pulse animation
  - Particle effect on button hover

### 2. Conversational Input Flow
- **Purpose**: Collect the four required inputs in a conversational format
- **Structure**: Four sequential screens, one for each input:
  
#### Step 1: Product Type
- Question: "What type of product are you building?"
- Example placeholder: "e.g., SaaS for team productivity"
- Input validation: Check for minimum length and appropriate content
- Progress indicator: 1/4
- "Next" button appears after valid input

#### Step 2: Problem Area
- Question: "What problem does your product solve?"
- Example placeholder: "e.g., Difficulty managing remote team collaboration"
- Contextual: References product type from previous answer
- Progress indicator: 2/4
- Navigation: Back and Next buttons

#### Step 3: Target Audience
- Question: "Who is your target audience?"
- Example placeholder: "e.g., Remote technical teams, startup founders"
- Progress indicator: 3/4
- Navigation: Back and Next buttons

#### Step 4: Additional Context
- Question: "Any additional context that would help find the right communities?" 
- Example placeholder: "e.g., Looking for technical feedback rather than marketing advice"
- Note: "Optional but helps improve results"
- Progress indicator: 4/4
- Navigation: Back and "Find Communities" buttons

- **Animations for each step**:
  - Slide-in transition between questions
  - Typewriter effect for questions (optional)
  - Subtle pulse when advancing to next question

### 3. Loading/Processing Experience
- **Purpose**: Keep user engaged during API processing time
- **Components**:
  - Main Lottie animation showing "Reddit universe exploration"
  - Progress bar (non-linear timing to feel responsive)
  - Reddit fact cards that cycle every 5 seconds
  - Status updates area
  
- **Reddit Facts Database** (12+ interesting facts with accurate statistics):
  - "Reddit has over 97 million daily active users worldwide"
  - "There are more than 3.4 million subreddits across Reddit"
  - "Reddit hosts over 100,000 active communities, from mainstream to niche interests"
  - "Users create approximately 5.3 billion pieces of content every six months"
  - "Redditors post over 7.5 million comments every day"
  - "Reddit receives nearly 5 billion monthly visits as of 2023"
  - "The average Reddit user subscribes to 25-30 different communities"
  - "Reddit users collectively spend millions of hours on the platform daily"
  - "Mobile visits to Reddit outnumber desktop visits by 3.5 times"
  - "Since 2005, Reddit has accumulated over 16 billion posts and comments"
  - "Popular posts can receive upwards of 16,000 votes on average"
  - "Reddit's mobile traffic reached 5.9 billion visits in January 2024 alone"

- **Status Updates**:
  - Generic updates rather than fake specific findings:
    - "Analyzing Reddit communities..."
    - "Searching for niche product communities..."
    - "Finding communities with active discussions..."
    - "Identifying groups with your target audience..."
    - "Evaluating community engagement levels..."
  
- **Timing**:
  - Start showing status updates after 3 seconds
  - Show a new update every 4-5 seconds
  - If API returns quickly, accelerate through remaining animations
  - If API takes longer than expected, cycle through additional messages

### 4. Results Display
- **Purpose**: Present subreddit recommendations in an engaging, interactive format
- **Components**:
  - Header with summary ("We found 5 communities with 350K+ potential users")
  - Subreddit cards (one per recommendation)
  - Selection checkboxes
  - "Continue with Selected" button
  - "Find More" option
  
- **Subreddit Card Elements**:
  - Subreddit name/link (r/example)
  - Subscriber count with icon
  - Brief description (from API)
  - Relevance explanation (why this community matches)
  - Selection checkbox
  - Visit button (opens in new tab)
  
- **Animations**:
  - Cards appear one by one with slight delay (200ms between each)
  - Hover effect: slight elevation + scale
  - Checkbox selection: satisfying animation + color change
  - Counter that updates as selections are made

### 5. Completion/Next Steps
- **Purpose**: Confirm selections and guide to next step
- **Components**:
  - Success message
  - Summary of selections
  - Clear CTA button for next steps
  - Confetti animation on completion

## Implementation Plan

### Phase 1: Core Structure (1 day)
- Set up React/Next.js project
- Create basic component structure
- Implement routing between steps
- Basic styling with Tailwind CSS

### Phase 2: Animation Integration (1 day)
- Integrate Framer Motion for transitions
- Add Lottie animations for loading states
- Implement micro-interactions

### Phase 3: API Integration (1 day)
- Connect to Reddit Discovery API
- Implement state management for user inputs
- Create loading state logic
- Build results display components

### Phase 4: Input Validation & Polish (1 day)
- Implement input validation with OpenAI (if used)
- Add fallback validation
- Polish animations and timing
- Add Reddit facts database
- Conduct user testing

## Edge Cases & Error Handling

### Input Validation Errors
- Display friendly error messages for invalid inputs
- Provide examples of appropriate responses
- Allow users to skip validation in case of persistent issues

### API Failures
- Implement graceful error handling
- Provide retry option
- Show alternative suggestions if API fails

### Performance Considerations
- Optimize animations for lower-end devices
- Implement animation reduction for users with reduced motion preferences
- Ensure responsiveness across device sizes

## Future Enhancements
- Save user preferences for repeat visits
- Add community rating system
- Implement advanced filtering of results
- Add social sharing of discoveries

## Metrics & Success Criteria
- Completion rate of onboarding flow (target: >80%)
- Time to complete flow (target: <2 minutes)
- Satisfaction rating (optional survey)
- Selection rate of recommended subreddits
- Return usage rate

## Open Questions
- Should we offer templates/examples for different industries?
- Do we need to implement user accounts for saving results?
- What is the optimal number of subreddit recommendations to display? 
- How should we balance showing large vs. niche communities in results?
- Should we add a feature to request additional subreddit suggestions? 

**Product:** What product(s) would you like to research?
United States Higher Education (Universities and the industry generally)

**Audience:** What audience(s) would you like insight on?
Any/all aggregate would be interesting, but if specifics are required, let's say - Students and prospective students 

**Problem:** What problems does your audience face that you'd like to understand better?
Negative perceptions and critiques of higher education's reputation and its value proposition. This includes concerns about rising costs, job market outcomes, debt burden, and whether degrees still provide meaningful career advantages in today's economy.

**Question:** What question(s) would you like answered about the above?
What are the top priorities or topics these groups are focused on regarding the reputation or value proposition of universities and higher education generally, and how, if at all, has that changed over time? We're particularly interested in understanding the most frequently discussed pain points and whether sentiment has shifted in response to economic conditions, remote work trends, or alternative education pathways. 