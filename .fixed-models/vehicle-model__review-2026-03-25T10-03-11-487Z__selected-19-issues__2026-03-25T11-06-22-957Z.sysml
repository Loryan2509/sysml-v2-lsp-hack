package VehicleModel {
    comment BasicVehicleModel /*
        Basic vehicle model demonstrating SysML v2.0 syntax
        including parts, attributes, ports, constraints, and requirements
    */

    requirement def PerformanceReq {
        doc /* The vehicle shall accelerate from 0 to 60 mph in less than 6 seconds */
    }

    requirement def SafetyReq {
        doc /* The vehicle shall have adequate braking performance */
    }

    verification def PerformanceVerification {
        doc /* Verify acceleration performance by test or analysis of engine power against the performance requirement */
        satisfy PerformanceReq;
    }

    verification def SafetyVerification {
        doc /* Verify braking-related wheel loading by inspection or analysis against the safety requirement */
        satisfy SafetyReq;
    }

    part def Subsystem {
        attribute mass : Real;
        attribute cost : Real;
    }

    port def PowerPort {
        attribute voltage : Real;
        attribute current : Real;
    }

    port def ControlPort {
        attribute steeringCommand : Real;
        attribute throttleCommand : Real;
        attribute brakeCommand : Real;
    }

    port def RoadInterfacePort {
        attribute normalForce : Real;
        attribute longitudinalForce : Real;
        attribute lateralForce : Real;
    }

    port def EnvironmentPort {
        attribute ambientTemperature : Real;
        attribute precipitationLevel : Real;
        attribute windSpeed : Real;
    }

    port def TrafficPort {
        attribute relativeSpeed : Real;
        attribute separationDistance : Real;
    }

    part def Engine {
        attribute power : Real;
        attribute mass : Real;
        attribute displacement : Real;
        out port powerPort : PowerPort;
    }

    part def Transmission :> Subsystem {
        attribute gearRatio : Real;
        attribute efficiency : Real;
    }

    part def Wheel {
        attribute diameter : Real;
        attribute width : Real;
    }

    part def Driver {
        attribute experience : Real;
        attribute licenseValid : Boolean;
        port vehicleControl : ControlPort;
    }

    part def RoadInfrastructure {
        port vehicleAccess : RoadInterfacePort;
        attribute surfaceFriction : Real;
        attribute speedLimit : Real;
    }

    part def Atmosphere {
        port vehicleExposure : EnvironmentPort;
        attribute ambientTemperature : Real;
        attribute precipitationLevel : Real;
    }

    part def TrafficSystem {
        port vehicleInteraction : TrafficPort;
        attribute trafficDensity : Real;
    }

    action def ProvidePropulsion {
        doc /* Generate propulsion power for vehicle motion */
    }

    action def TransferTorque {
        doc /* Transfer and adapt torque from engine to driven wheels */
    }

    action def GenerateRoadTraction {
        doc /* Convert wheel rotation into traction at the road surface */
    }

    part def AccelerationAnalysis {
        attribute enginePower : Real;
        attribute vehicleMass : Real;
        attribute zeroToSixtyTime : Real;

        constraint zeroToSixtyEstimate {
            zeroToSixtyTime = vehicleMass / enginePower;
        }
    }

    part def BrakingSafetyAnalysis {
        attribute vehicleMass : Real;
        attribute wheelCount : Integer;
        attribute massPerWheel : Real;

        constraint brakingLoadEstimate {
            massPerWheel = vehicleMass / wheelCount;
        }
    }

    part def Vehicle {
        part engine : Engine;
        part transmission : Transmission;
        part wheels : Wheel[4];
        out port powerOut : PowerPort;
        port driverControl : ControlPort;
        port roadContact : RoadInterfacePort;
        port atmosphereExposure : EnvironmentPort;
        port trafficInterface : TrafficPort;

        attribute mass : Real;
        attribute maxSpeed : Real;
        attribute ignitionOn : Boolean;
        attribute faultDetected : Boolean;
        attribute safeToOperate : Boolean;

        constraint massConstraint {
            mass < 2000.0
        }

        constraint speedConstraint {
            maxSpeed > 60.0
        }

        state def OperatingModes {
            state Off;
            state Starting;
            state Idle;
            state Driving;
            state ShuttingDown;
            state DegradedOperation;
            state SafeState;
            state Final;

            transition OffToStarting
                first Off
                then Starting;

            transition StartingToIdle
                first Starting
                then Idle;

            transition IdleToDriving
                first Idle
                then Driving;

            transition DrivingToDegraded
                first Driving
                then DegradedOperation;

            transition DegradedToSafeState
                first DegradedOperation
                then SafeState;

            transition DrivingToShuttingDown
                first Driving
                then ShuttingDown;

            transition IdleToShuttingDown
                first Idle
                then ShuttingDown;

            transition DegradedToShuttingDown
                first DegradedOperation
                then ShuttingDown;

            transition ShuttingDownToOff
                first ShuttingDown
                then Off;

            transition SafeStateToFinal
                first SafeState
                then Final;
        }
    }

    use case def DriveCar {
        subject vehicle : Vehicle;
    }

    part myCar : Vehicle {
        :>> engine {
            :>> power = 250.0;
            :>> mass = 150.0;
            :>> displacement = 2.0;
        }

        :>> transmission {
            :>> gearRatio = 3.5;
            :>> efficiency = 0.92;
        }

        :>> mass = 1500.0;
        :>> maxSpeed = 120.0;
        :>> ignitionOn = false;
        :>> faultDetected = false;
        :>> safeToOperate = true;

        action providePropulsion : ProvidePropulsion;
        action transferTorque : TransferTorque;
        action generateRoadTraction : GenerateRoadTraction;
    }

    requirement def VehicleContextBoundaryReq {
        doc /* The vehicle system model shall explicitly represent the system boundary, including external actors, external systems, environmental elements, and the interfaces crossing that boundary. */

        subject vehicle : Vehicle;

        require constraint {
            vehicle.driverControl != null and
            vehicle.roadContact != null and
            vehicle.atmosphereExposure != null and
            vehicle.trafficInterface != null
        }
    }

    part def VehicleSystemContext {
        part vehicleOfInterest : Vehicle;
        part driver : Driver;
        part roadInfrastructure : RoadInfrastructure;
        part atmosphere : Atmosphere;
        part trafficSystem : TrafficSystem;

        connect driver.vehicleControl to vehicleOfInterest.driverControl;
        connect roadInfrastructure.vehicleAccess to vehicleOfInterest.roadContact;
        connect atmosphere.vehicleExposure to vehicleOfInterest.atmosphereExposure;
        connect trafficSystem.vehicleInteraction to vehicleOfInterest.trafficInterface;
    }

    part vehicleOperationalContext : VehicleSystemContext {
        :>> driver {
            :>> experience = 8.0;
            :>> licenseValid = true;
        }
        :>> roadInfrastructure {
            :>> surfaceFriction = 0.8;
            :>> speedLimit = 65.0;
        }
        :>> atmosphere {
            :>> ambientTemperature = 20.0;
            :>> precipitationLevel = 0.0;
        }
        :>> trafficSystem {
            :>> trafficDensity = 0.4;
        }
    }

    requirement def VehicleMassSpecReq {
        doc /* Vehicle mass shall be specified in kilograms with analysis bounds and nominal value. */

        subject vehicle : Vehicle;

        require constraint {
            vehicle.mass >= 800.0 and vehicle.mass <= 2000.0 and vehicle.mass == 1500.0
        }
    }

    requirement def VehicleMaxSpeedSpecReq {
        doc /* Vehicle maximum speed shall be specified in miles per hour with analysis bounds and nominal value. */

        subject vehicle : Vehicle;

        require constraint {
            vehicle.maxSpeed >= 60.0 and vehicle.maxSpeed <= 250.0 and vehicle.maxSpeed == 120.0
        }
    }

    requirement def EnginePowerSpecReq {
        doc /* Engine power shall be specified in kilowatts with analysis bounds and nominal value. */

        subject engine : Engine;

        require constraint {
            engine.power >= 50.0 and engine.power <= 500.0 and engine.power == 250.0
        }
    }

    requirement def EngineMassSpecReq {
        doc /* Engine mass shall be specified in kilograms with analysis bounds and nominal value. */

        subject engine : Engine;

        require constraint {
            engine.mass >= 50.0 and engine.mass <= 400.0 and engine.mass == 150.0
        }
    }

    requirement def EngineDisplacementSpecReq {
        doc /* Engine displacement shall be specified in liters with analysis bounds and nominal value. */

        subject engine : Engine;

        require constraint {
            engine.displacement >= 0.8 and engine.displacement <= 8.0 and engine.displacement == 2.0
        }
    }

    requirement def TransmissionGearRatioSpecReq {
        doc /* Transmission gear ratio shall be specified as a dimensionless ratio with analysis bounds and nominal value. */

        subject transmission : Transmission;

        require constraint {
            transmission.gearRatio >= 2.0 and transmission.gearRatio <= 6.0 and transmission.gearRatio == 3.5
        }
    }

    requirement def TransmissionEfficiencySpecReq {
        doc /* Transmission efficiency shall be specified as a dimensionless ratio with analysis bounds and nominal value. */

        subject transmission : Transmission;

        require constraint {
            transmission.efficiency >= 0.85 and transmission.efficiency <= 1.0 and transmission.efficiency == 0.92
        }
    }

    requirement def WheelDiameterSpecReq {
        doc /* Wheel diameter shall be specified in inches with analysis bounds and nominal value. */

        subject wheel : Wheel;

        require constraint {
            wheel.diameter >= 14.0 and wheel.diameter <= 22.0 and wheel.diameter == 18.0
        }
    }

    requirement def WheelWidthSpecReq {
        doc /* Wheel width shall be specified in inches with analysis bounds and nominal value. */

        subject wheel : Wheel;

        require constraint {
            wheel.width >= 6.0 and wheel.width <= 14.0 and wheel.width == 8.0
        }
    }

    requirement def PowerPortInterfaceSpecReq {
        doc /* Electrical power interface attributes shall be specified with explicit units and bounded operating values. */

        subject portIfc : PowerPort;

        require constraint {
            portIfc.voltage >= 12.0 and portIfc.voltage <= 800.0 and portIfc.current >= 0.0 and portIfc.current <= 200.0
        }
    }

    action def StartVehicleAction {
        in driver : Driver;
        in vehicle : Vehicle;
    }

    action def SelectDriveMode {
        in driver : Driver;
        in vehicle : Vehicle;
    }

    action def AccelerateVehicle {
        in driver : Driver;
        in vehicle : Vehicle;
    }

    action def SteerVehicle {
        in driver : Driver;
        in vehicle : Vehicle;
    }

    action def MonitorDrivingConditions {
        in driver : Driver;
        in vehicle : Vehicle;
    }

    action def StopVehicleAction {
        in driver : Driver;
        in vehicle : Vehicle;
    }

    action def DriveCarFlow {
        in driver : Driver;
        in vehicle : Vehicle;

        action start : StartVehicleAction;
        action selectDriveMode : SelectDriveMode;
        action accelerate : AccelerateVehicle;
        action monitor : MonitorDrivingConditions;
        action steer : SteerVehicle;
        action stop : StopVehicleAction;

        flow start to selectDriveMode;
        flow selectDriveMode to accelerate;
        flow accelerate to monitor;
        flow monitor to steer;
        flow steer to stop;
    }

    requirement def DriveCarBehaviorReq {
        doc /* The DriveCar use case shall be elaborated by a nominal behavioural flow covering vehicle start, controlled movement, driver monitoring, steering, and stopping. */

        subject vehicle : Vehicle;
    }

    analysis def PerformanceVerificationAnalysis {
        subject vehicle : Vehicle;
        part accelAnalysis : AccelerationAnalysis {
            :>> enginePower = vehicle.engine.power;
            :>> vehicleMass = vehicle.mass;
        }
    }

    analysis def SafetyVerificationAnalysis {
        subject vehicle : Vehicle;
        part brakingAnalysis : BrakingSafetyAnalysis {
            :>> vehicleMass = vehicle.mass;
            :>> wheelCount = 4;
        }
    }

    analysis myCarPerformanceVerification : PerformanceVerificationAnalysis {
        subject vehicle = myCar;
    }

    analysis myCarSafetyVerification : SafetyVerificationAnalysis {
        subject vehicle = myCar;
    }

    action def PrepareVehicle {
        in driver : Driver;
        in vehicle : Vehicle;
    }

    action def DriveVehicle {
        in driver : Driver;
        in vehicle : Vehicle;
    }

    action def ShutdownVehicleAction {
        in driver : Driver;
        in vehicle : Vehicle;
    }

    action def DetectReducedPerformance {
        in vehicle : Vehicle;
    }

    action def EnterSafeStateAction {
        in driver : Driver;
        in vehicle : Vehicle;
    }

    action def NominalDriveMission {
        in driver : Driver;
        in vehicle : Vehicle;

        action prepare : PrepareVehicle;
        action start : StartVehicleAction;
        action drive : DriveVehicle;
        action stop : StopVehicleAction;
        action shutdown : ShutdownVehicleAction;

        flow from driver to prepare.driver;
        flow from vehicle to prepare.vehicle;
        flow from driver to start.driver;
        flow from vehicle to start.vehicle;
        flow from driver to drive.driver;
        flow from vehicle to drive.vehicle;
        flow from driver to stop.driver;
        flow from vehicle to stop.vehicle;
        flow from driver to shutdown.driver;
        flow from vehicle to shutdown.vehicle;

        succession first prepare then start;
        succession first start then drive;
        succession first drive then stop;
        succession first stop then shutdown;
    }

    action def DegradedDriveMission {
        in driver : Driver;
        in vehicle : Vehicle;

        action prepare : PrepareVehicle;
        action start : StartVehicleAction;
        action detectReducedPerformance : DetectReducedPerformance;
        action enterSafeState : EnterSafeStateAction;
        action shutdown : ShutdownVehicleAction;

        flow from driver to prepare.driver;
        flow from vehicle to prepare.vehicle;
        flow from driver to start.driver;
        flow from vehicle to start.vehicle;
        flow from vehicle to detectReducedPerformance.vehicle;
        flow from driver to enterSafeState.driver;
        flow from vehicle to enterSafeState.vehicle;
        flow from driver to shutdown.driver;
        flow from vehicle to shutdown.vehicle;

        succession first prepare then start;
        succession first start then detectReducedPerformance;
        succession first detectReducedPerformance then enterSafeState;
        succession first enterSafeState then shutdown;
    }

    action def VehicleOperationalScenarios {
        in driver : Driver;
        in vehicle : Vehicle;

        action nominalMission : NominalDriveMission;
        action degradedMission : DegradedDriveMission;

        flow from driver to nominalMission.driver;
        flow from vehicle to nominalMission.vehicle;
        flow from driver to degradedMission.driver;
        flow from vehicle to degradedMission.vehicle;
    }

    part licensedDriver : Driver {
        :>> experience = 8.0;
        :>> licenseValid = true;
    }

    action vehicleMissionValidation : VehicleOperationalScenarios {
        in driver = licensedDriver;
        in vehicle = myCar;
    }

    requirement def StartupScenarioReq {
        doc /* The vehicle shall model startup behavior from Off through Starting to Idle when ignition is commanded on and no fault is present. */

        subject vehicle : Vehicle;
    }

    requirement def ShutdownScenarioReq {
        doc /* The vehicle shall model shutdown behavior from Driving or Idle through ShuttingDown to Off when ignition is commanded off. */

        subject vehicle : Vehicle;
    }

    requirement def DegradedAndSafeStateReq {
        doc /* The vehicle shall model degraded operation and transition to a safe state when a fault is detected or continued operation is not safe. */

        subject vehicle : Vehicle;
    }

    use case def StartVehicle {
        subject vehicle : Vehicle;
    }

    use case def ShutdownVehicle {
        subject vehicle : Vehicle;
    }

    use case def OperateInDegradedMode {
        subject vehicle : Vehicle;
    }

    use case def EnterSafeState {
        subject vehicle : Vehicle;
    }

    attribute def VerificationMethod :> String;

    verification def AccelerationTestCase {
        doc /* Verify 0 to 60 mph acceleration by executing a timed vehicle acceleration test. */
        subject vehicle : Vehicle;
        attribute method : VerificationMethod = "test";
    }

    verification def BrakingAnalysisCase {
        doc /* Verify braking adequacy by analysis of vehicle mass distribution and wheel-related braking load. */
        subject vehicle : Vehicle;
        attribute method : VerificationMethod = "analysis";
    }

    action def AccelerationTestScenario {
        in vehicleUnderTest : Vehicle;
        out measuredZeroToSixtyTime : Real;

        doc /* Test scenario that exercises full-throttle acceleration and records 0-60 mph time */
    }

    action def BrakingAnalysisScenario {
        in vehicleUnderAnalysis : Vehicle;
        out brakingAdequacyIndex : Real;

        doc /* Analysis scenario that evaluates braking adequacy against vehicle mass and wheel configuration */
    }

    part def VerificationEvidence {
        attribute evidenceId : String;
        attribute status : String;
        attribute summary : String;
    }

    verification def AccelerationVerificationCase {
        subject vehicle : Vehicle;
        objective {
            doc /* Verify the vehicle satisfies the acceleration performance requirement */
        }
        method {
            doc /* Test */
        }
    }

    verification def BrakingVerificationCase {
        subject vehicle : Vehicle;
        objective {
            doc /* Verify the vehicle satisfies the braking safety requirement */
        }
        method {
            doc /* Analysis */
        }
    }

    part accelTestEvidence : VerificationEvidence {
        :>> evidenceId = "EV-ACCEL-001";
        :>> status = "planned";
        :>> summary = "0-60 mph acceleration test record for myCar";
    }

    part brakingAnalysisEvidence : VerificationEvidence {
        :>> evidenceId = "EV-BRAKE-001";
        :>> status = "planned";
        :>> summary = "Braking adequacy analysis record for myCar";
    }

    verification accelVerification : AccelerationVerificationCase {
        :>> vehicle = myCar;
        perform scenario : AccelerationTestScenario {
            :>> vehicleUnderTest = myCar;
        }
        satisfy performanceRequirement : PerformanceReq;
        exhibit evidence : VerificationEvidence = accelTestEvidence;
    }

    verification brakingVerification : BrakingVerificationCase {
        :>> vehicle = myCar;
        perform scenario : BrakingAnalysisScenario {
            :>> vehicleUnderAnalysis = myCar;
        }
        satisfy safetyRequirement : SafetyReq;
        exhibit evidence : VerificationEvidence = brakingAnalysisEvidence;
    }
}