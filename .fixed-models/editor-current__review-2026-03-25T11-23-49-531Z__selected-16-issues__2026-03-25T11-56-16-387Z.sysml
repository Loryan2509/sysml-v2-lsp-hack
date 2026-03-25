package VehicleModel {
    part def Subsystem {
        attribute mass : Real;
        attribute cost : Real;
    }

    port def PowerPort {
        attribute voltage : Real;
        attribute current : Real;
    }

    part def Engine {
        attribute power : Real;
        attribute mass : Real;
        attribute displacement : Real;
        port powerPort : PowerPort;
    }

    part def Transmission :> Subsystem {
        attribute gearRatio : Real;
        attribute efficiency : Real;
    }

    part def Wheel {
        attribute diameter : Real;
        attribute width : Real;
        attribute mass : Real;
        attribute material : String;
        attribute loadRating : Real;
        attribute tirePressure : Real;
        attribute rollingResistanceCoefficient : Real;
        attribute boltPattern : String;
        attribute hubBoreDiameter : Real;
        attribute brakeInterfaceDiameter : Real;
        attribute brakeCompatible : Boolean;
    }

    verification def WheelCapabilityInspection {
        doc /* Inspect and analyse wheel physical, load, and brake-interface characteristics for suitability in vehicle service. */
        subject wheel : Wheel;
    }

    attribute def SpeedValue;
    attribute def AccelerationValue;
    attribute def BrakeForceValue;

    item def StartCommand;
    item def DriveCommand;
    item def AccelerateCommand;
    item def BrakeCommand;
    item def StopCommand;
    item def ShutdownCommand;

    action def StartVehicleAction {
        in vehicle : Vehicle;
        out ignitionState : Boolean;
        out resultingSpeed : SpeedValue;
    }

    action def DriveVehicleAction {
        in vehicle : Vehicle;
        in targetSpeed : SpeedValue;
        out movingState : Boolean;
        out achievedSpeed : SpeedValue;
    }

    action def AccelerateVehicleAction {
        in vehicle : Vehicle;
        in currentSpeed : SpeedValue;
        in targetSpeed : SpeedValue;
        out newSpeed : SpeedValue;
        out accelerating : Boolean;
    }

    action def BrakeVehicleAction {
        in vehicle : Vehicle;
        in currentSpeed : SpeedValue;
        in brakeForce : BrakeForceValue;
        out newSpeed : SpeedValue;
        out braking : Boolean;
    }

    action def StopVehicleAction {
        in vehicle : Vehicle;
        out finalSpeed : SpeedValue;
        out stopped : Boolean;
    }

    action def ShutdownVehicleAction {
        in vehicle : Vehicle;
        out ignitionState : Boolean;
        out shutdownComplete : Boolean;
    }

    action def TransitionToIdleAction {
        in vehicle : Vehicle;
        out idleReady : Boolean;
    }

    part def Vehicle {
        part engine : Engine;
        part transmission : Transmission;
        part wheels : Wheel[4];
        port powerOut : PowerPort;

        attribute mass : Real;
        attribute maxSpeed : Real;
        attribute brakingAvailable : Boolean;
        attribute engineAvailable : Boolean;
        attribute electricalPowerAvailable : Boolean;
        attribute reducedPerformanceActive : Boolean;
        attribute safeStopCapability : Boolean;
    }

    constraint def PowerLimitConstraint {
        in voltage : Real;
        in current : Real;
    }

    constraint def PowerMassRatioConstraint {
        in power : Real;
        in mass : Real;
    }

    constraint def EfficiencyConstraint {
        in efficiency : Real;
    }

    constraint def WheelSizeConstraint {
        in diameter : Real;
    }

    constraint def VehicleMassConstraint {
        in mass : Real;
    }

    constraint def VehicleSpeedConstraint {
        in maxSpeed : Real;
    }

    part def Driver {
        attribute experience : Real;
        attribute licenseValid : Boolean;
    }

    verification def AccelerationTest {
        doc /* Test 0 to 60 mph acceleration performance for the vehicle. */
        subject vehicle : Vehicle;
    }

    verification def BrakingAssessment {
        doc /* Analysis or test of braking adequacy for the vehicle. */
        subject vehicle : Vehicle;
    }

    verification def TopSpeedTest {
        doc /* Test maximum vehicle speed under defined conditions. */
        subject vehicle : Vehicle;
    }

    verification def StartDriveStopDemo {
        doc /* Demonstrate that the vehicle can be started, driven, and stopped by an operator. */
        subject vehicle : Vehicle;
    }

    verification def ReliabilityAnalysis {
        doc /* Analyze mean distance between service-affecting failures for the vehicle. */
        subject vehicle : Vehicle;
    }

    verification def MaintainabilityInspection {
        doc /* Inspect or demonstrate that routine maintenance can be completed within the required time. */
        subject vehicle : Vehicle;
    }

    verification def InteroperabilityInspection {
        doc /* Inspect compatibility of the vehicle charging/power interface with external infrastructure. */
        subject vehicle : Vehicle;
    }

    requirement def VehicleStakeholderReq {
        doc /* Base stakeholder requirement applicable to the vehicle product. */
        subject vehicle : Vehicle;
    }

    requirement def WheelAnalysisDataReq :> VehicleStakeholderReq {
        doc /* Each wheel shall define mass, material, load rating, and brake/hub interface properties sufficient to support structural, safety, and performance analyses. */
        subject vehicle : Vehicle;
    }

    requirement def FunctionalOperationReq :> VehicleStakeholderReq {
        doc /* The vehicle shall enable a licensed driver to start, propel, steer, and stop the vehicle during normal road operation. */
        subject vehicle : Vehicle;
    }

    requirement def PerformanceReq :> VehicleStakeholderReq {
        doc /* The vehicle shall accelerate from 0 to 60 mph in less than 6 seconds. */
        subject vehicle : Vehicle;
    }

    requirement def MaxSpeedReq :> VehicleStakeholderReq {
        doc /* The vehicle shall achieve a maximum speed of at least 100 mph. */
        subject vehicle : Vehicle;
    }

    requirement def SafetyReq :> VehicleStakeholderReq {
        doc /* The vehicle shall have adequate braking performance for its gross mass and wheel configuration. */
        subject vehicle : Vehicle;
    }

    requirement def ReliabilityReq :> VehicleStakeholderReq {
        doc /* The vehicle shall provide dependable operation with a mean distance between service-affecting failures of at least 10000 miles. */
        subject vehicle : Vehicle;
    }

    requirement def MaintainabilityReq :> VehicleStakeholderReq {
        doc /* The vehicle shall be maintainable such that routine scheduled service can be completed within 2 hours using standard service tools. */
        subject vehicle : Vehicle;
    }

    requirement def InteroperabilityReq :> VehicleStakeholderReq {
        doc /* The vehicle shall provide an external power interface that is compatible with supported charging or power-service infrastructure. */
        subject vehicle : Vehicle;
    }

    requirement def OperationalTransitionsReq :> VehicleStakeholderReq {
        doc /* The vehicle shall explicitly model startup, shutdown, and operational mode transitions including off, starting, idle, driving, braking, and shutdown completion. */
        subject vehicle : Vehicle;
    }

    requirement def BrakingDegradationReq :> VehicleStakeholderReq {
        doc /* The vehicle shall support continued controlled operation or transition to a safe stop when braking performance is degraded. */
        subject vehicle : Vehicle;
    }

    requirement def EngineFailureReq :> VehicleStakeholderReq {
        doc /* The vehicle shall provide a defined response to engine failure by enabling reduced performance operation or execution of a safe stop. */
        subject vehicle : Vehicle;
    }

    requirement def PowerLossReq :> VehicleStakeholderReq {
        doc /* The vehicle shall transition to a safe state when electrical power is unavailable. */
        subject vehicle : Vehicle;
    }

    requirement def ReducedPerformanceReq :> VehicleStakeholderReq {
        doc /* The vehicle shall support a reduced-performance operating mode during degraded operation to maintain controllability until a safe stop can be completed. */
        subject vehicle : Vehicle;
    }

    requirement def SafeStopReq :> VehicleStakeholderReq {
        doc /* The vehicle shall provide a safe stop capability for off-nominal conditions including braking degradation, engine failure, and power loss. */
        subject vehicle : Vehicle;
    }

    use case def DriveCar {
        actor driver : Driver;
use case def StartVehicle {
        actor driver : Driver;
        subject vehicle : Vehicle;

        objective {
            doc /* Bring the vehicle from parked and powered-down condition to a ready-to-drive state. */
        }
    }

    use case def AccelerateVehicle {
        actor driver : Driver;
        subject vehicle : Vehicle;

        objective {
            doc /* Increase vehicle speed in a controlled manner after startup or during route execution. */
        }
    }

    use case def CruiseVehicle {
        actor driver : Driver;
        subject vehicle : Vehicle;

        objective {
            doc /* Maintain steady forward motion at the intended operating speed during normal driving. */
        }
    }

    use case def BrakeVehicle {
        actor driver : Driver;
        subject vehicle : Vehicle;

        objective {
            doc /* Reduce vehicle speed or stop the vehicle in a controlled and safe manner. */
        }
    }

    use case def ParkVehicle {
        actor driver : Driver;
        subject vehicle : Vehicle;

        objective {
            doc /* Transition the vehicle from active driving to a secured parked state. */
        }
    }

    use case def ShutdownVehicle {
        actor driver : Driver;
        subject vehicle : Vehicle;

        objective {
            doc /* Transition the vehicle from ready or parked condition to a powered-down state. */
        }
    }

    use case def SafeStopVehicle {
        actor driver : Driver;
        subject vehicle : Vehicle;

        objective {
            doc /* Place the vehicle into a safe stopped condition during off-nominal or degraded operation. */
        }
    }
        subject vehicle : Vehicle;
    }

    use case def DriveCarWithBrakingDegradation {
        actor driver : Driver;
        subject vehicle : Vehicle;
    }

    use case def RespondToEngineFailure {
        actor driver : Driver;
        subject vehicle : Vehicle;
    }

    use case def RespondToPowerLoss {
        actor driver : Driver;
        subject vehicle : Vehicle;
    }

    use case def OperateInReducedPerformanceMode {
        actor driver : Driver;
        subject vehicle : Vehicle;
    }

    use case def ExecuteSafeStop {
        actor driver : Driver;
        subject vehicle : Vehicle;
    }

    state def VehicleOperationalStates {
        state Off;
        state Starting;
        state Idle;
        state Driving;
        state Braking;
        state ShuttingDown;
        state ShutdownComplete;
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

        :>> wheels[1] {
            :>> diameter = 18.0;
            :>> width = 8.5;
            :>> mass = 12.0;
            :>> material = "AluminumAlloy";
            :>> loadRating = 600.0;
            :>> tirePressure = 35.0;
            :>> rollingResistanceCoefficient = 0.015;
            :>> boltPattern = "5x114.3";
            :>> hubBoreDiameter = 64.1;
            :>> brakeInterfaceDiameter = 13.0;
            :>> brakeCompatible = true;
        }

        :>> wheels[2] {
            :>> diameter = 18.0;
            :>> width = 8.5;
            :>> mass = 12.0;
            :>> material = "AluminumAlloy";
            :>> loadRating = 600.0;
            :>> tirePressure = 35.0;
            :>> rollingResistanceCoefficient = 0.015;
            :>> boltPattern = "5x114.3";
            :>> hubBoreDiameter = 64.1;
            :>> brakeInterfaceDiameter = 13.0;
            :>> brakeCompatible = true;
        }

        :>> wheels[3] {
            :>> diameter = 18.0;
            :>> width = 8.5;
            :>> mass = 12.0;
            :>> material = "AluminumAlloy";
            :>> loadRating = 600.0;
            :>> tirePressure = 35.0;
            :>> rollingResistanceCoefficient = 0.015;
            :>> boltPattern = "5x114.3";
            :>> hubBoreDiameter = 64.1;
            :>> brakeInterfaceDiameter = 13.0;
            :>> brakeCompatible = true;
        }

        :>> wheels[4] {
            :>> diameter = 18.0;
            :>> width = 8.5;
            :>> mass = 12.0;
            :>> material = "AluminumAlloy";
            :>> loadRating = 600.0;
            :>> tirePressure = 35.0;
            :>> rollingResistanceCoefficient = 0.015;
            :>> boltPattern = "5x114.3";
            :>> hubBoreDiameter = 64.1;
            :>> brakeInterfaceDiameter = 13.0;
            :>> brakeCompatible = true;
        }

        :>> mass = 1500.0;
        :>> maxSpeed = 120.0;
        :>> brakingAvailable = true;
        :>> engineAvailable = true;
        :>> electricalPowerAvailable = true;
        :>> reducedPerformanceActive = false;
        :>> safeStopCapability = true;
    }

    analysis def AccelerationAnalysisCase {
        subject vehicle : Vehicle;
        attribute computedZeroToSixtyTime : Real;
        attribute passed : Boolean;
    }

    verification def BrakingSafetyTestCase {
        subject vehicle : Vehicle;
        attribute wheelCount : Integer;
        attribute loadPerWheel : Real;
        attribute passed : Boolean;
    }

    item def VerificationEvidence {
        doc /* Captured model result, analysis output, or test record used as objective evidence for requirement verification */
        attribute evidenceId : String;
        attribute summary : String;
        attribute status : String;
    }

    verification def VerifyPerformance {
        subject vehicle : Vehicle;
        doc /* Performance requirement is verified by analysis of engine power against the acceleration threshold surrogate. */
    }

    verification def VerifySafety {
        subject vehicle : Vehicle;
        doc /* Safety requirement is verified by evaluating per-wheel load against the specified limit. */
    }

    requirement performanceRequirement : PerformanceReq {
        subject vehicle = myCar;
    }

    requirement safetyRequirement : SafetyReq {
        subject vehicle = myCar;
    }

    analysis myCarPerformanceAnalysis : AccelerationAnalysisCase {
        subject vehicle = myCar;
        :>> computedZeroToSixtyTime = 6.5;
        :>> passed = false;
    }

    verification myCarBrakingSafetyTest : BrakingSafetyTestCase {
        subject vehicle = myCar;
        :>> wheelCount = 4;
        :>> loadPerWheel = 375.0;
        :>> passed = true;
    }

    item performanceEvidence : VerificationEvidence {
        :>> evidenceId = "EVID-PERF-001";
        :>> summary = "Acceleration analysis result for myCar using engine power surrogate.";
        :>> status = "recorded";
    }

    item safetyEvidence : VerificationEvidence {
        :>> evidenceId = "EVID-SAFE-001";
        :>> summary = "Braking safety test result showing acceptable per-wheel load.";
        :>> status = "recorded";
    }

    verification performPerformanceVerification : VerifyPerformance {
        subject vehicle = myCar;
    }

    verification performSafetyVerification : VerifySafety {
        subject vehicle = myCar;
    }

    satisfy performanceRequirement by myCar;
    satisfy safetyRequirement by myCar;
}