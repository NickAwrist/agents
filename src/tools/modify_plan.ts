import { BaseTool } from "./BaseTool";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";
import { Plan } from "../Plan";

export class ModifyPlan extends BaseTool {
  constructor() {
    super("modify_plan", "Use this tool to create, view, or update the plan. It should be called to outline the plan before starting implementation and should be called after completing a step.");
  }

  override toTool(): Tool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'The action to perform: "create" (starts a new plan), "complete_current" (marks current step as done and moves to next), "add" (adds step to the end), "view" (displays current plan)' },
            steps: { type: 'array', items: { type: 'string' }, description: 'List of steps for "create" action. E.g. ["setup project", "write code", "test"]' },
            step: { type: 'string', description: 'A single step to add for the "add" action.' }
          },
          required: ['action']
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>, ctx?: RunContext): Promise<string> {
    const action = args.action as string;

    if (!ctx?.agentInstance) {
      return "Error: No agent instance found in context.";
    }

    if (!ctx.agentInstance.plan) {
      ctx.agentInstance.plan = new Plan([]);
    }

    const plan = ctx.agentInstance.plan;

    switch (action) {
      case 'create':
        const stepsArg = args.steps as string[];
        if (!Array.isArray(stepsArg)) {
          return "Error: 'steps' property must be an array of strings for 'create' action.";
        }
        plan.setSteps(stepsArg);
        break;
      case 'complete_current':
        plan.completeCurrentStep();
        break;
      case 'add':
        const stepArg = args.step as string;
        if (typeof stepArg !== 'string') {
          return "Error: 'step' property must be a string for 'add' action.";
        }
        plan.addStep(stepArg);
        break;
      case 'view':
        break;
      default:
        return `Error: Unknown action '${action}'. Valid actions are: create, complete_current, add, view.`;
    }

    return "Current Plan:\n" + plan.getSteps().join('\n');
  }
}