const {
    createVisa,
    getVisas,
    getVisaById,
    updateVisa,
    deleteVisa,
    toggleVisaStatus,
} = require("../services/visa.service");

const {
    successResponse,
    errorResponse,
} = require("../utils/apiResponse");

const createVisaController = async (req, res) => {
    try {
        const visa = await createVisa(req.body);

        return successResponse(
            res,
            "Visa created successfully",
            visa,
            201
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const getVisasController = async (req, res) => {
    try {
        const visas = await getVisas();

        return successResponse(
            res,
            "Visas fetched successfully",
            visas
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const getVisaByIdController = async (req, res) => {
    try {
        const visa = await getVisaById(req.params.id);

        return successResponse(
            res,
            "Visa fetched successfully",
            visa
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const updateVisaController = async (req, res) => {
    try {
        const visa = await updateVisa(
            req.params.id,
            req.body
        );

        return successResponse(
            res,
            "Visa updated successfully",
            visa
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const deleteVisaController = async (req, res) => {
    try {
        await deleteVisa(req.params.id);

        return successResponse(
            res,
            "Visa deleted successfully"
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const toggleVisaStatusController = async (req, res) => {
    try {
        const visa = await toggleVisaStatus(req.params.id);

        return successResponse(
            res,
            "Visa status updated successfully",
            visa
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

module.exports = {
    createVisaController,
    getVisasController,
    getVisaByIdController,
    updateVisaController,
    deleteVisaController,
    toggleVisaStatusController,
};