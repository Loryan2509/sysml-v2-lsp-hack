package thermal_system {
    requirement def EmergencyShutdown {
        doc /* The system shall enter emergency shutdown when temperature reaches the configured emergency shutdown threshold. */
    }

    requirement def CoolingFanActivation {
        doc /* The cooling fan shall turn on when temperature reaches the configured cooling fan activation threshold, provided the system is not in emergency shutdown. */
    }

    requirement def SprinklerActivation {
        doc /* The sprinkler system shall turn on when temperature reaches the configured sprinkler activation threshold, provided the system is not in emergency shutdown. */
    }

    part def CoolingSystem {
        attribute temperatureC : Real = 25.0;
        attribute emergencyShutdownThresholdC : Real = 95.0;
        attribute coolingFanStartThresholdC : Real = 85.0;
    }

    part def SprinklerSystem {
        attribute activationThresholdC : Real = 90.0;
    }

    part def System {
        part cooling : CoolingSystem;
        part sprinkler : SprinklerSystem;
    }
}