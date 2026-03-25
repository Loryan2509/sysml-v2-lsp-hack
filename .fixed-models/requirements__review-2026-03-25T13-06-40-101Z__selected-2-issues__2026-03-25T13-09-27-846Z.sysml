package requirements {
    requirement def Shape {
        doc /* The system external form shall be a cube with 1 m edge length. */
    }

    requirement def Material {
        doc /* The system primary structural material shall be 2024 Aluminium. */
    }

    requirement def Weight {
        doc /* The system shall weigh no more than 1 kg. */
    }

    requirement def LightweightConstruction {
        doc /* To satisfy the external shape, material, and weight requirements together, the system shall use a non-solid lightweight construction, such as a thin-walled hollow or lattice-reinforced structure, rather than a solid cube. */
    }

    requirement def ShapeInterpretation {
        doc /* The cube requirement applies to the external envelope geometry only and does not require a fully solid volume. */
    }

    requirement def StructuralMassAllocation {
        doc /* The aluminium structural configuration, including wall thickness and internal architecture, shall be sized such that total system mass does not exceed 1 kg. */
    }

    requirement ShapeReq : Shape;
    requirement MaterialReq : Material;
    requirement WeightReq : Weight;
    requirement ShapeInterpretationReq : ShapeInterpretation;
    requirement LightweightConstructionReq : LightweightConstruction;
    requirement StructuralMassAllocationReq : StructuralMassAllocation;

    abstract requirement def PriorityAnnotatedRequirement {
        attribute priority : Integer;
        attribute rationale : String;
    }

    requirement def GovernedShape :> Shape, PriorityAnnotatedRequirement;
    requirement def GovernedMaterial :> Material, PriorityAnnotatedRequirement;
    requirement def GovernedWeight :> Weight, PriorityAnnotatedRequirement;
    requirement def GovernedShapeInterpretation :> ShapeInterpretation, PriorityAnnotatedRequirement;
    requirement def GovernedLightweightConstruction :> LightweightConstruction, PriorityAnnotatedRequirement;
    requirement def GovernedStructuralMassAllocation :> StructuralMassAllocation, PriorityAnnotatedRequirement;

    requirement GoverningShape : GovernedShape {
        priority = 1;
        rationale = "External cube geometry is retained as core system intent.";
    }

    requirement GoverningMaterial : GovernedMaterial {
        priority = 2;
        rationale = "2024 Aluminium remains the required primary structural material.";
    }

    requirement GoverningWeight : GovernedWeight {
        priority = 3;
        rationale = "Low mass is mandatory and is achieved through construction approach rather than changing external geometry or primary material.";
    }

    requirement GoverningShapeInterpretation : GovernedShapeInterpretation {
        priority = 1;
        rationale = "Clarifies that the shape requirement constrains the outer envelope, resolving the apparent solid-cube interpretation.";
    }

    requirement GoverningLightweightConstruction : GovernedLightweightConstruction {
        priority = 2;
        rationale = "Provides the required satisfaction strategy that makes the combined requirement set feasible.";
    }

    requirement GoverningStructuralMassAllocation : GovernedStructuralMassAllocation {
        priority = 3;
        rationale = "Allocates mass-performance compliance to detailed structural sizing.";
    }
}