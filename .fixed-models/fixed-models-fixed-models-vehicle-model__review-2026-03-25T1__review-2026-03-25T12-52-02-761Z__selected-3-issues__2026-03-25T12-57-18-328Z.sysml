package VehicleModel {
    /**
     * Basic vehicle model demonstrating SysML v2.0 syntax
     * including parts, attributes, ports, constraints, and requirements
     * with more physically grounded propulsion and braking relations.
     */

    part def Subsystem {
        attribute mass : Real;
        attribute cost : Real;
    }

    port def MechanicalPowerPort {
        attribute torque : Real;
        attribute rotationalSpeed : Real;

        constraint nonNegativeFlow {
            torque >= 0.0 and rotationalSpeed > 0.0
        }
    }

    part def Wheel {
        attribute diameter : Real;
        attribute width : Real;
        attribute brakeTorqueCapacity : Real;
        attribute tireRoadFrictionCoefficient : Real;
        attribute dynamicNormalLoad : Real;
        attribute effectiveRadius : Real;

        constraint sizeConstraint {
            diameter >= 0.50 and diameter <= 0.90
        }

        constraint frictionConstraint {
            tireRoadFrictionCoefficient > 0.0 and tireRoadFrictionCoefficient <= 1.2
        }

        constraint brakeTorqueConstraint {
            brakeTorqueCapacity > 0.0
        }

        constraint radiusConsistency {
            effectiveRadius > 0.0 and effectiveRadius <= diameter / 2.0
        }

        constraint normalLoadConsistency {
            dynamicNormalLoad > 0.0
        }
    }

    part def Engine {
        attribute power : Real;
        attribute mass : Real;
        attribute displacement : Real;
        port mechanicalPowerOut : MechanicalPowerPort;

        constraint massConsistency {
            mass > 0.0
        }

        constraint powerConsistency {
            power > 0.0
        }

        constraint powerMassRatio {
            power / mass > 1.0
        }
    }

    part def Transmission :> Subsystem {
        attribute gearRatio : Real;
        attribute efficiency : Real;

        constraint efficiencyConstraint {
            efficiency >= 0.85 and efficiency <= 1.0
        }

        constraint gearRatioConstraint {
            gearRatio > 0.0
        }
    }

    part def Vehicle {
        part engine : Engine;
        part transmission : Transmission;
        part wheels : Wheel[4];
        port drivetrainOut : MechanicalPowerPort;

        attribute mass : Real;
        attribute maxSpeed : Real;
        attribute zeroToSixtyTime : Real;
        attribute brakingDeceleration : Real;

        attribute launchTractionLimitForce : Real;
        attribute rollingResistanceForce : Real;
        attribute aerodynamicDragForceAt60mph : Real;
        attribute aerodynamicDragForceAtLaunch : Real;
        attribute drivelineTractiveForce : Real;
        attribute netAccelerationForceAtLaunch : Real;

        attribute totalBrakeForceCapacity : Real;
        attribute requiredBrakeForce : Real;

        constraint massConstraint {
            mass > 0.0 and mass < 2000.0
        }

        constraint speedConstraint {
            maxSpeed > 60.0
        }

        constraint accelerationConsistency {
            zeroToSixtyTime > 0.0
        }

        constraint brakingConsistency {
            brakingDeceleration > 0.0
        }

        constraint propulsionForceConsistency {
            launchTractionLimitForce > 0.0 and
            rollingResistanceForce >= 0.0 and
            aerodynamicDragForceAt60mph >= 0.0 and
            aerodynamicDragForceAtLaunch >= 0.0 and
            drivelineTractiveForce > 0.0 and
            netAccelerationForceAtLaunch == drivelineTractiveForce - rollingResistanceForce - aerodynamicDragForceAtLaunch and
            netAccelerationForceAtLaunch > 0.0 and
            launchTractionLimitForce <=
                (wheels[1].tireRoadFrictionCoefficient * wheels[1].dynamicNormalLoad +
                 wheels[2].tireRoadFrictionCoefficient * wheels[2].dynamicNormalLoad +
                 wheels[3].tireRoadFrictionCoefficient * wheels[3].dynamicNormalLoad +
                 wheels[4].tireRoadFrictionCoefficient * wheels[4].dynamicNormalLoad) and
            drivelineTractiveForce <= launchTractionLimitForce and
            drivelineTractiveForce <=
                ((engine.power / engine.mechanicalPowerOut.rotationalSpeed) *
                 transmission.gearRatio * transmission.efficiency) / wheels[1].effectiveRadius and
            drivetrainOut.rotationalSpeed ==
                engine.mechanicalPowerOut.rotationalSpeed / transmission.gearRatio
        }

        constraint brakeForceConsistency {
            requiredBrakeForce == mass * brakingDeceleration and
            totalBrakeForceCapacity ==
                (wheels[1].brakeTorqueCapacity / wheels[1].effectiveRadius) +
                (wheels[2].brakeTorqueCapacity / wheels[2].effectiveRadius) +
                (wheels[3].brakeTorqueCapacity / wheels[3].effectiveRadius) +
                (wheels[4].brakeTorqueCapacity / wheels[4].effectiveRadius) and
            totalBrakeForceCapacity > 0.0 and
            requiredBrakeForce > 0.0 and
            totalBrakeForceCapacity >= requiredBrakeForce and
            (wheels[1].brakeTorqueCapacity / wheels[1].effectiveRadius) <=
                (wheels[1].tireRoadFrictionCoefficient * wheels[1].dynamicNormalLoad) and
            (wheels[2].brakeTorqueCapacity / wheels[2].effectiveRadius) <=
                (wheels[2].tireRoadFrictionCoefficient * wheels[2].dynamicNormalLoad) and
            (wheels[3].brakeTorqueCapacity / wheels[3].effectiveRadius) <=
                (wheels[3].tireRoadFrictionCoefficient * wheels[3].dynamicNormalLoad) and
            (wheels[4].brakeTorqueCapacity / wheels[4].effectiveRadius) <=
                (wheels[4].tireRoadFrictionCoefficient * wheels[4].dynamicNormalLoad)
        }
    }

    requirement def PerformanceReq {
        doc /* The vehicle shall accelerate from 0 to 60 mph in less than 6 seconds. Compliance is represented by the achieved vehicle-level acceleration time together with a physically grounded launch-force path that accounts for drivetrain delivery, traction limit, rolling resistance, and aerodynamic drag at the launch operating point. */

        subject vehicle : Vehicle;

        require constraint {
            vehicle.zeroToSixtyTime < 6.0 and
            vehicle.netAccelerationForceAtLaunch > 0.0 and
            vehicle.drivelineTractiveForce <= vehicle.launchTractionLimitForce and
            vehicle.drivelineTractiveForce <=
                (((vehicle.engine.power / vehicle.engine.mechanicalPowerOut.rotationalSpeed) *
                  vehicle.transmission.gearRatio * vehicle.transmission.efficiency) /
                 vehicle.wheels[1].effectiveRadius) and
            vehicle.launchTractionLimitForce <=
                (vehicle.wheels[1].tireRoadFrictionCoefficient * vehicle.wheels[1].dynamicNormalLoad +
                 vehicle.wheels[2].tireRoadFrictionCoefficient * vehicle.wheels[2].dynamicNormalLoad +
                 vehicle.wheels[3].tireRoadFrictionCoefficient * vehicle.wheels[3].dynamicNormalLoad +
                 vehicle.wheels[4].tireRoadFrictionCoefficient * vehicle.wheels[4].dynamicNormalLoad) and
            vehicle.netAccelerationForceAtLaunch ==
                vehicle.drivelineTractiveForce - vehicle.rollingResistanceForce - vehicle.aerodynamicDragForceAtLaunch
        }
    }

    requirement def SafetyReq {
        doc /* The vehicle shall have adequate braking performance. Compliance is represented by vehicle-level braking deceleration together with a causal force path from wheel brake torque through wheel effective radius to tire-road braking force, bounded by available tire-road friction and wheel normal load. */

        subject vehicle : Vehicle;

        require constraint {
            vehicle.brakingDeceleration >= 8.0 and
            vehicle.requiredBrakeForce == vehicle.mass * vehicle.brakingDeceleration and
            vehicle.totalBrakeForceCapacity ==
                (vehicle.wheels[1].brakeTorqueCapacity / vehicle.wheels[1].effectiveRadius) +
                (vehicle.wheels[2].brakeTorqueCapacity / vehicle.wheels[2].effectiveRadius) +
                (vehicle.wheels[3].brakeTorqueCapacity / vehicle.wheels[3].effectiveRadius) +
                (vehicle.wheels[4].brakeTorqueCapacity / vehicle.wheels[4].effectiveRadius) and
            vehicle.totalBrakeForceCapacity >= vehicle.requiredBrakeForce and
            vehicle.wheels[1].tireRoadFrictionCoefficient >= 0.8 and
            vehicle.wheels[2].tireRoadFrictionCoefficient >= 0.8 and
            vehicle.wheels[3].tireRoadFrictionCoefficient >= 0.8 and
            vehicle.wheels[4].tireRoadFrictionCoefficient >= 0.8 and
            (vehicle.wheels[1].brakeTorqueCapacity / vehicle.wheels[1].effectiveRadius) <=
                (vehicle.wheels[1].tireRoadFrictionCoefficient * vehicle.wheels[1].dynamicNormalLoad) and
            (vehicle.wheels[2].brakeTorqueCapacity / vehicle.wheels[2].effectiveRadius) <=
                (vehicle.wheels[2].tireRoadFrictionCoefficient * vehicle.wheels[2].dynamicNormalLoad) and
            (vehicle.wheels[3].brakeTorqueCapacity / vehicle.wheels[3].effectiveRadius) <=
                (vehicle.wheels[3].tireRoadFrictionCoefficient * vehicle.wheels[3].dynamicNormalLoad) and
            (vehicle.wheels[4].brakeTorqueCapacity / vehicle.wheels[4].effectiveRadius) <=
                (vehicle.wheels[4].tireRoadFrictionCoefficient * vehicle.wheels[4].dynamicNormalLoad)
        }
    }

    use case def DriveCar {
        actor driver : Driver;
        subject vehicle : Vehicle;

        objective {
            doc /* Successfully operate the vehicle from point A to point B */
        }
    }

    part def Driver {
        attribute experience : Real;
        attribute licenseValid : Boolean;
    }

    part myCar : Vehicle {
        :>> engine {
            :>> power = 320.0;
            :>> mass = 150.0;
            :>> displacement = 2.0;
            :>> mechanicalPowerOut {
                :>> torque = 509.09;
                :>> rotationalSpeed = 0.628;
            }
        }

        :>> transmission {
            :>> gearRatio = 3.5;
            :>> efficiency = 0.92;
        }

        :>> drivetrainOut {
            :>> torque = 1638.24;
            :>> rotationalSpeed = 0.179;
        }

        :>> wheels[1] {
            :>> diameter = 0.66;
            :>> width = 8.0;
            :>> brakeTorqueCapacity = 1800.0;
            :>> tireRoadFrictionCoefficient = 0.9;
            :>> dynamicNormalLoad = 4000.0;
            :>> effectiveRadius = 0.33;
        }

        :>> wheels[2] {
            :>> diameter = 0.66;
            :>> width = 8.0;
            :>> brakeTorqueCapacity = 1800.0;
            :>> tireRoadFrictionCoefficient = 0.9;
            :>> dynamicNormalLoad = 4000.0;
            :>> effectiveRadius = 0.33;
        }

        :>> wheels[3] {
            :>> diameter = 0.66;
            :>> width = 8.0;
            :>> brakeTorqueCapacity = 1800.0;
            :>> tireRoadFrictionCoefficient = 0.9;
            :>> dynamicNormalLoad = 3500.0;
            :>> effectiveRadius = 0.33;
        }

        :>> wheels[4] {
            :>> diameter = 0.66;
            :>> width = 8.0;
            :>> brakeTorqueCapacity = 1800.0;
            :>> tireRoadFrictionCoefficient = 0.9;
            :>> dynamicNormalLoad = 3500.0;
            :>> effectiveRadius = 0.33;
        }

        :>> mass = 1500.0;
        :>> maxSpeed = 120.0;
        :>> zeroToSixtyTime = 5.6;
        :>> brakingDeceleration = 8.5;

        :>> launchTractionLimitForce = 13500.0;
        :>> rollingResistanceForce = 220.0;
        :>> aerodynamicDragForceAt60mph = 450.0;
        :>> aerodynamicDragForceAtLaunch = 0.0;
        :>> drivelineTractiveForce = 3122.0;
        :>> netAccelerationForceAtLaunch = 2902.0;

        :>> requiredBrakeForce = 12750.0;
        :>> totalBrakeForceCapacity = 21818.18;
    }
}