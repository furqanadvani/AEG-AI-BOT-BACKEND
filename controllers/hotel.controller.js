const {
    createHotel,
    getHotels,
    getHotelById,
    updateHotel,
    deleteHotel,
    toggleHotelStatus,
} = require("../services/hotel.service");

const {
    successResponse,
    errorResponse,
} = require("../utils/apiResponse");

const createHotelController = async (req, res) => {
    try {
        const hotel = await createHotel(req.body);

        return successResponse(
            res,
            "Hotel created successfully",
            hotel,
            201
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const getHotelsController = async (req, res) => {
    try {
        const hotels = await getHotels();

        return successResponse(
            res,
            "Hotels fetched successfully",
            hotels
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const getHotelByIdController = async (req, res) => {
    try {
        const hotel = await getHotelById(req.params.id);

        return successResponse(
            res,
            "Hotel fetched successfully",
            hotel
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const updateHotelController = async (req, res) => {
    try {
        const hotel = await updateHotel(
            req.params.id,
            req.body
        );

        return successResponse(
            res,
            "Hotel updated successfully",
            hotel
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const deleteHotelController = async (req, res) => {
    try {
        await deleteHotel(req.params.id);

        return successResponse(
            res,
            "Hotel deleted successfully"
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const toggleHotelStatusController = async (req, res) => {
    try {
        const hotel = await toggleHotelStatus(
            req.params.id
        );

        return successResponse(
            res,
            "Hotel status updated successfully",
            hotel
        );
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

module.exports = {
    createHotelController,
    getHotelsController,
    getHotelByIdController,
    updateHotelController,
    deleteHotelController,
    toggleHotelStatusController,
};