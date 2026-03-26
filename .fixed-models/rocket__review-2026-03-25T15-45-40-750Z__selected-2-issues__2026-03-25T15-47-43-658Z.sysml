package rocket {
    requirement def Thrusters {
        doc /* The rocket shall have 3 thrusters. */
    }

    part def Thruster;

    part def Fuel;

    part def Rocket {
        doc /* A vehicle designed to propel itself by expelling exhaust gas. */

        part thrusters : Thruster[3];
        part fuel : Fuel;

        attribute maxSpeed : Real;
        attribute range : Real;
    }

    requirement thrustersReq : Thrusters;

    satisfy thrustersSatisfaction {
        subject = Rocket;
        requirement = thrustersReq;
    }
}