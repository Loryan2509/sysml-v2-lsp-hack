package VehicleModel {
    /**
     * Basic vehicle model demonstrating SysML v2.0 syntax
     * including parts, attributes, ports, constraints, and requirements
     */
 
    part def Subsystem {
        attribute mass : Real;
        attribute cost : Real;
    }
 
    port def MechanicalPowerPort {
        attribute torque : Real;
        attribute rotationalSpeed : Real;
 
        constraint nonNegativeFlow {
            torque >= 0.0 and rotationalSpeed >= 0.0
        }
    }
 
    part def Wheel {
        attribute diameter : Real;
        attribute width : Real;
        attribute brakeTorqueCapacity : Real;
        attribute tireRoadFrictionCoefficient : Real;
 
        constraint sizeConstraint {
            diameter >= 14.0 and diameter <= 22.0
        }
 
        constraint frictionConstraint {
            tireRoadFrictionCoefficient > 0.0 and tireRoadFrictionCoefficient <= 1.2
        }
 
        constraint brakeTorqueConstraint {
            brakeTorqueCapacity > 0.0
        }
    }
 
    part def Engine {
        attribute power : Real;
        attribute mass : Real;
        attribute displacement : Real;
        port mechanicalPowerOut : MechanicalPowerPort;
 
        constraint powerMassRatio {
            power / mass > 0.1
        }
    }
 
    part def Transmission :> Subsystem {
        attribute gearRatio : Real;
        attribute efficiency : Real;
 
        constraint efficiencyConstraint {
            efficiency >= 0.85 and efficiency <= 1.0
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
 
        constraint massConstraint {
            mass < 2000.0
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
    }
 
    requirement def PerformanceReq {
        doc /* The vehicle shall accelerate from 0 to 60 mph in less than 6 seconds. Compliance is represented by a vehicle-level acceleration time attribute supported by adequate delivered propulsion power relative to vehicle mass and transmission efficiency. */
 
        subject vehicle : Vehicle;
 
        require constraint {
            vehicle.zeroToSixtyTime < 6.0 and
            vehicle.engine.power * vehicle.transmission.efficiency / vehicle.mass >= 0.18
        }
    }
 
    requirement def SafetyReq {
        doc /* The vehicle shall have adequate braking performance. Compliance is represented by a vehicle-level braking deceleration capability and sufficient wheel brake torque capacity. */
 
        subject vehicle : Vehicle;
 
        require constraint {
            vehicle.brakingDeceleration >= 8.0 and
            vehicle.wheels[1].brakeTorqueCapacity >= 1500.0 and
            vehicle.wheels[2].brakeTorqueCapacity >= 1500.0 and
            vehicle.wheels[3].brakeTorqueCapacity >= 1500.0 and
            vehicle.wheels[4].brakeTorqueCapacity >= 1500.0 and
            vehicle.wheels[1].tireRoadFrictionCoefficient >= 0.8 and
            vehicle.wheels[2].tireRoadFrictionCoefficient >= 0.8 and
            vehicle.wheels[3].tireRoadFrictionCoefficient >= 0.8 and
            vehicle.wheels[4].tireRoadFrictionCoefficient >= 0.8
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
 
    // Example vehicle instance
    part myCar : Vehicle {
        :>> engine {
            :>> power = 320.0;
            :>> mass = 150.0;
            :>> displacement = 2.0;
        }
 
        :>> transmission {
            :>> gearRatio = 3.5;
            :>> efficiency = 0.92;
        }
 
        :>> wheels[1] {
            :>> diameter = 18.0;
            :>> width = 8.0;
            :>> brakeTorqueCapacity = 1800.0;
            :>> tireRoadFrictionCoefficient = 0.9;
        }
 
        :>> wheels[2] {
            :>> diameter = 18.0;
            :>> width = 8.0;
            :>> brakeTorqueCapacity = 1800.0;
            :>> tireRoadFrictionCoefficient = 0.9;
        }
 
        :>> wheels[3] {
            :>> diameter = 18.0;
            :>> width = 8.0;
            :>> brakeTorqueCapacity = 1800.0;
            :>> tireRoadFrictionCoefficient = 0.9;
        }
 
        :>> wheels[4] {
            :>> diameter = 18.0;
            :>> width = 8.0;
            :>> brakeTorqueCapacity = 1800.0;
            :>> tireRoadFrictionCoefficient = 0.9;
        }
 
        :>> mass = 1500.0;
        :>> maxSpeed = 120.0;
        :>> zeroToSixtyTime = 5.6;
        :>> brakingDeceleration = 8.5;
    }
}