package requirements {
    requirement def Shape {
        doc /* The system shall have the external shape of a cube with side length no greater than 0.05 m. */
    }

    requirement def Material {
        doc /* The system structure shall be made of 2024 Aluminium. */
    }

    requirement def Weight {
        doc /* The system shall have a mass no greater than 1 kg. */
    }

    requirement def GeometryMaterialMassConsistency {
        doc /* The geometry, material, and mass requirements shall be jointly satisfied. The maximum cube side length is limited to 0.05 m so that a system using 2024 Aluminium can reasonably comply with the 1 kg mass limit. */
    }

    requirement GeometryMaterialMassResolution : GeometryMaterialMassConsistency;
    requirement ShapeReq : Shape;
    requirement MaterialReq : Material;
    requirement WeightReq : Weight;
}