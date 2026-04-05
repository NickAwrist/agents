export interface PlanStep {
  text: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export class Plan {
  private steps: PlanStep[];

  constructor(steps: string[]) {
    this.steps = steps.map(text => ({ text, status: 'pending' }));
    if (this.steps.length > 0) {
      this.steps[0]!.status = 'in_progress';
    }
  }

  getSteps(): string[] {
    if (this.steps.length === 0) return ["No steps in plan."];
    return this.steps.map((step, index) => {
      const mark = step.status === 'completed' ? '[x]' : step.status === 'in_progress' ? '[CURRENT]' : '[ ]';
      return `${index + 1}. ${mark} ${step.text}`;
    });
  }

  setSteps(steps: string[]): void {
    this.steps = steps.map(text => ({ text, status: 'pending' }));
    if (this.steps.length > 0) {
      this.steps[0]!.status = 'in_progress';
    }
  }

  addStep(step: string): void {
    if (this.steps.length === 0) {
      this.steps.push({ text: step, status: 'in_progress' });
    } else {
      this.steps.push({ text: step, status: 'pending' });
    }
  }

  completeCurrentStep(): void {
    const currentIndex = this.steps.findIndex(s => s.status === 'in_progress');
    if (currentIndex !== -1) {
      this.steps[currentIndex]!.status = 'completed';
      if (currentIndex + 1 < this.steps.length) {
        this.steps[currentIndex + 1]!.status = 'in_progress';
      }
    } else {
      const firstPendingIndex = this.steps.findIndex(s => s.status === 'pending');
      if (firstPendingIndex !== -1) {
        this.steps[firstPendingIndex]!.status = 'in_progress';
      }
    }
  }
}